const mongoose = require('mongoose');

const querySchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  companyName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  query: { type: String, required: true },
  assignedTo: { type: String, default: '' }, // tech team username
  daysToComplete: { type: String, default: '' },
  status: { type: String, enum: ['Open', 'In Progress', 'Resolved'], default: 'Open' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Track who created the query
}, { timestamps: true });

// Add indexes for better performance
querySchema.index({ assignedTo: 1 });
querySchema.index({ createdAt: -1 });

const Query = mongoose.model('Query', querySchema);

// Test the connection
Query.findOne({})
  .then(() => console.log('✅ Query model connected successfully'))
  .catch(err => console.error('❌ Query model connection error:', err));

module.exports = Query;