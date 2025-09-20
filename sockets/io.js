// Socket.IO instance export
// This file provides a centralized way to access the Socket.IO instance

let ioInstance = null;

function setIOInstance(io) {
  ioInstance = io;
}

function getIOInstance() {
  return ioInstance;
}

module.exports = {
  setIOInstance,
  getIOInstance
};