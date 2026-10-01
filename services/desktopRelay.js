const crypto = require('node:crypto');
const { GsmRelay, relay } = require('./gsmRelay');
const { exchangeTicket } = require('./desktopGsm');
class DesktopRelay extends GsmRelay {
  attach(io, verifyTicket = exchangeTicket) {
    const namespace = io.of('/gsm-desktop');
    namespace.use((socket, next) => {
      try {
        const identity = verifyTicket(socket.handshake.auth?.ticket);
        if (this.host(identity.userId)) throw new Error('Your account is already connected to a modem. Disconnect it first.');
        socket.data.modemUser = identity.userId;
        next();
      } catch (error) { next(new Error(error.message || 'Invalid connection ticket.')); }
    });
    namespace.on('connection', socket => {
      const userId = socket.data.modemUser;
      if (this.host(userId)) return socket.disconnect(true);
      // The random value is internal only; users never enter a pairing code.
      const code = crypto.randomBytes(12).toString('hex').toUpperCase();
      socket.handshake.auth.pairingCode = code;
      this.register(socket);
      this.pair(userId, code);
    });
    const timer = setInterval(() => this.sweep(), 5000); timer.unref();
    return () => clearInterval(timer);
  }
}
const desktopRelay = new DesktopRelay({ saveCall: relay.saveCall });
module.exports = { DesktopRelay, desktopRelay };
