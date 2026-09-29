// gsmHandlers.js
// Socket.IO relay handlers for GSM Modem functionality across all connected CRM clients.
// Allows a single physical USB Modem PC to serve all CRM users remotely via cloud Socket.IO.

let activeGsmHost = null; // { socketId, state, lastSeen }
let latestModemState = {
  connected: false,
  call: 'idle',
  number: '',
  since: null,
  muted: false,
  audio: 'off',
  error: '',
  diagnostics: {},
  stats: {},
  logs: [],
  history: [],
  isHostOnline: false,
};

let ioRef = null;

function getLatestState() {
  const isHostAlive = activeGsmHost && (Date.now() - activeGsmHost.lastSeen < 15000);
  return {
    ...latestModemState,
    isHostOnline: Boolean(isHostAlive),
  };
}

async function executeAction(action, payload) {
  if (!activeGsmHost || !activeGsmHost.socketId) {
    throw new Error('GSM Modem Host is not online. Please run Start-GSM-Modem.bat on the modem PC.');
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Modem Host response timed out.')), 10000);
    if (!ioRef) return reject(new Error('Socket.IO instance not initialized.'));
    ioRef.to(activeGsmHost.socketId).emit('gsm:execute_action', { action, payload }, (res) => {
      clearTimeout(timer);
      if (res && res.error) reject(new Error(res.error));
      else resolve(res || {});
    });
  });
}

const registerGsmHandlers = (io, socket) => {
  ioRef = io;

  // 1. GSM Modem Host (the PC with USB dongle) registers itself
  socket.on('gsm:register_host', (initialState) => {
    activeGsmHost = {
      socketId: socket.id,
      state: initialState || latestModemState,
      lastSeen: Date.now(),
    };
    if (initialState) {
      latestModemState = { ...latestModemState, ...initialState, isHostOnline: true };
    }
    console.log(`📡 [GSM Relay] Modem Host registered: socket ${socket.id}`);
    io.emit('gsm:state_changed', getLatestState());
  });

  // 2. Modem Host sends real-time state update (signal, call ringing, connected, AT log)
  socket.on('gsm:host_state_update', (newState) => {
    if (activeGsmHost && activeGsmHost.socketId === socket.id) {
      activeGsmHost.state = newState;
      activeGsmHost.lastSeen = Date.now();
      latestModemState = { ...latestModemState, ...newState, isHostOnline: true };
      // Broadcast state update to all CRM clients
      io.emit('gsm:state_changed', getLatestState());
    }
  });

  // 3. Any CRM client (Device B, C, Mobile, Vercel app) requests current GSM state
  socket.on('gsm:get_state', (callback) => {
    const responseState = getLatestState();
    if (typeof callback === 'function') {
      callback(responseState);
    } else {
      socket.emit('gsm:state_changed', responseState);
    }
  });

  // 4. Any CRM client sends an action (connect, disconnect, dial, hangup, answer, mute, diagnostics)
  socket.on('gsm:client_action', async (data, callback) => {
    const { action, payload } = data || {};
    try {
      const result = await executeAction(action, payload);
      if (typeof callback === 'function') callback(result);
    } catch (err) {
      if (typeof callback === 'function') callback({ error: err.message });
    }
  });

  // 5. Handle disconnection of Modem Host
  socket.on('disconnect', () => {
    if (activeGsmHost && activeGsmHost.socketId === socket.id) {
      console.log(`📡 [GSM Relay] Modem Host disconnected: socket ${socket.id}`);
      activeGsmHost = null;
      latestModemState = {
        ...latestModemState,
        connected: false,
        isHostOnline: false,
        diagnostics: {},
        call: 'idle',
      };
      io.emit('gsm:state_changed', getLatestState());
    }
  });
};

module.exports = {
  registerGsmHandlers,
  getLatestState,
  executeAction,
};
