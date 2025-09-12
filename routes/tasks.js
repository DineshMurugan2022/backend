const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const auth = require('../middleware/auth');

// Create a new task (only admin and team leaders can create tasks)
router.post('/', auth, async (req, res) => {
  try {
    // Check if user has permission to create tasks
    if (req.user.userGroup !== 'admin' && req.user.userGroup !== 'team leader') {
      return res.status(403).json({ message: 'Only admin and team leaders can create tasks' });
    }
    
    const task = new Task({
      ...req.body,
      createdBy: req.user._id,
      status: 'pending',
    });
    await task.save();
    // Populate necessary fields
    await task.populate([
      { path: 'assignee', select: 'username' },
      { path: 'createdBy', select: 'username' },
      { path: 'completedBy', select: 'username' },
      { path: 'notes.createdBy', select: 'username' },
    ]);

    // Emit notification to assignee if task is assigned to someone
    if (task.assignee && task.assignee._id.toString() !== req.user._id.toString()) {
      const notificationData = {
        taskId: task._id,
        taskTitle: task.title,
        assigneeId: task.assignee._id.toString(),
        assignedBy: req.user.username
      };
      
      // Emit to specific user room
      req.io.to(`user_${task.assignee._id}`).emit('taskAssigned', notificationData);
      console.log(`📋 Task notification sent to user ${task.assignee._id}`);
    }

    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

// Get tasks based on user role
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Admin and team leaders can see all tasks
    if (req.user.userGroup === 'admin' || req.user.userGroup === 'team leader') {
      // No filter - see all tasks
    } else {
      // Regular users only see tasks assigned to them
      query = { assignee: req.user._id };
    }
    
    const tasks = await Task.find(query)
      .populate([
        { path: 'assignee', select: 'username' },
        { path: 'createdBy', select: 'username' },
        { path: 'completedBy', select: 'username' },
        { path: 'notes.createdBy', select: 'username' },
      ])
      .sort({ dueDate: 1 });
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// Update a task
router.patch('/:id', auth, async (req, res) => {
  const allowedUpdates = ['title', 'description', 'dueDate', 'priority', 'status', 'assignee', 'relatedTo', 'relatedId'];
  const updates = Object.keys(req.body);
  const isValid = updates.every(u => allowedUpdates.includes(u));
  if (!isValid) return res.status(400).json({ message: 'Invalid updates!' });

  try {
    // Check if user has permission to edit tasks
    const canEdit = req.user.userGroup === 'admin' || req.user.userGroup === 'team leader';
    
    let query = { _id: req.params.id };
    
    if (canEdit) {
      // Admin and team leaders can edit any task
    } else {
      // Regular users can only update status of tasks assigned to them
      query.$or = [{ assignee: req.user._id }];
      
      // Restrict regular users to only update status
      const restrictedUpdates = updates.filter(u => u !== 'status');
      if (restrictedUpdates.length > 0) {
        return res.status(403).json({ message: 'You can only update task status' });
      }
    }
    
    const task = await Task.findOne(query);

    if (!task) return res.status(404).json({ message: 'Task not found or unauthorized' });

    const originalAssignee = task.assignee;

    // If marking as completed
    if (req.body.status === 'completed') {
      task.completedBy = req.user._id;
      task.completedAt = new Date();
    }

    updates.forEach((u) => (task[u] = req.body[u]));
    await task.save();

    await task.populate([
      { path: 'assignee', select: 'username' },
      { path: 'createdBy', select: 'username' },
      { path: 'completedBy', select: 'username' },
      { path: 'notes.createdBy', select: 'username' },
    ]);

    // Emit notification if assignee changed
    if (req.body.assignee && 
        originalAssignee?.toString() !== req.body.assignee &&
        req.body.assignee !== req.user._id.toString()) {
      const notificationData = {
        taskId: task._id,
        taskTitle: task.title,
        assigneeId: req.body.assignee,
        assignedBy: req.user.username
      };
      
      req.io.to(`user_${req.body.assignee}`).emit('taskAssigned', notificationData);
      console.log(`📋 Task reassignment notification sent to user ${req.body.assignee}`);
    }

    // Emit update notification to assignee if task was updated by someone else
    if (task.assignee && task.assignee._id.toString() !== req.user._id.toString()) {
      const notificationData = {
        taskId: task._id,
        taskTitle: task.title,
        assigneeId: task.assignee._id.toString(),
        updatedBy: req.user.username
      };
      
      req.io.to(`user_${task.assignee._id}`).emit('taskUpdated', notificationData);
      console.log(`🔄 Task update notification sent to user ${task.assignee._id}`);
    }

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

// Delete a task (only admin and team leaders can delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    // Check if user has permission to delete tasks
    if (req.user.userGroup !== 'admin' && req.user.userGroup !== 'team leader') {
      return res.status(403).json({ message: 'Only admin and team leaders can delete tasks' });
    }
    
    const task = await Task.findOneAndDelete({
      _id: req.params.id,
    });
    if (!task) return res.status(404).json({ message: 'Task not found' });

    res.json({ message: 'Task deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// Add a note to a task
router.post('/:id/notes', auth, async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      $or: [
        { assignee: req.user._id },
        { createdBy: req.user._id },
      ],
    });

    if (!task) return res.status(404).json({ message: 'Task not found' });

    task.notes.push({
      content: req.body.content,
      createdBy: req.user._id,
    });

    await task.save();

    await task.populate([
      { path: 'assignee', select: 'username' },
      { path: 'createdBy', select: 'username' },
      { path: 'completedBy', select: 'username' },
      { path: 'notes.createdBy', select: 'username' },
    ]);

    res.status(201).json(task);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
