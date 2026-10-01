// Legacy shared modem events must never control or disclose a user's modem.
const registerGsmHandlers = (_io, socket) => {
  for (const event of ['gsm:register_host', 'gsm:host_state_update', 'gsm:get_state', 'gsm:client_action']) {
    socket.on(event, (...args) => {
      const callback = args.at(-1);
      if (typeof callback === 'function') callback({ error: 'Use the authenticated /api/gsm endpoints and pair your local agent.' });
    });
  }
};
module.exports = { registerGsmHandlers };
