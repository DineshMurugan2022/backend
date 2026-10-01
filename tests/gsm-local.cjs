const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { LocalGsm } = require('../services/localGsm');
const { selectPorts } = require('../../huawei-e173-test/lib/ports');
function setup(t, overrides = {}) {
  let ports = [{ path: 'COM4', friendlyName: 'HUAWEI PC UI' }, { path: 'COM5', friendlyName: 'HUAWEI Application' }];
  let time = 0;
  const calls = [], saved = [];
  const service = new LocalGsm({
    createModem: () => {
      const modem = new EventEmitter(); modem.state = { call: 'idle', connected: false }; modem.history = [];
      modem.snapshot = () => ({ ...modem.state, history: modem.history });
      modem.connect = async settings => { modem.settings = settings; modem.state.connected = true; };
      modem.disconnect = async () => { modem.state.connected = false; modem.state.call = 'idle'; };
      modem.dial = async number => { calls.push(number); modem.state.number = number; };
      modem.answer = async () => { modem.state.call = 'active'; };
      return modem;
    }, listPorts: async () => ports, audioDevices: () => [], selectPorts, now: () => time,
    saveCall: async (owner, entry) => saved.push({ owner, entry }), ...overrides
  });
  service.init(); t.after(() => service.stop());
  return { service, calls, saved, setPorts: value => { ports = value; }, setTime: value => { time = value; } };
}
test('backend lists ports without pairing and connects directly', async t => {
  const { service } = setup(t); await service.scan();
  assert.equal(service.devices('alice').ports.length, 2);
  const state = await service.action('alice', 'connect');
  assert.equal(state.connected, true); assert.equal(state.owned, true);
});
test('only owner can read incoming caller or control the modem', async t => {
  const { service, calls } = setup(t);
  await service.action('alice', 'connect');
  service.modem.state = { connected: true, call: 'ringing', number: 'private-number' };
  assert.equal(service.state('alice').number, 'private-number');
  assert.equal(service.state('bob').number, ''); assert.equal(service.state('bob').busy, true);
  assert.deepEqual(service.devices('bob').ports, []);
  for (const action of ['connect', 'dial', 'answer', 'hangup', 'disconnect']) await assert.rejects(service.action('bob', action), /another user/);
  await service.release('bob'); assert.equal(service.owner, 'alice');
  await service.action('alice', 'dial', { number: '123456', userId: 'bob' }); assert.deepEqual(calls, ['123456']);
});
test('simultaneous Connect reserves the modem before asynchronous detection', async t => {
  const { service } = setup(t);
  const first = service.action('alice', 'connect');
  await assert.rejects(service.action('bob', 'connect'), /another user/);
  await first; assert.equal(service.owner, 'alice');
});
test('failed detection releases the claim', async t => {
  const { service, setPorts } = setup(t); setPorts([]);
  await assert.rejects(service.action('alice', 'connect'), /Huawei/);
  assert.equal(service.owner, null);
});
test('disconnect and logout release ownership and discard prior caller details', async t => {
  const { service } = setup(t);
  await service.action('alice', 'connect'); service.modem.state.number = 'private';
  await service.action('alice', 'disconnect');
  await service.action('bob', 'connect'); assert.equal(service.state('bob').number, undefined);
  await service.release('bob'); assert.equal(service.owner, null);
});
test('unplug and inactivity release the modem', async t => {
  const { service, setPorts, setTime } = setup(t);
  await service.action('alice', 'connect');
  setPorts([]); await service.scan(); assert.equal(service.owner, null);
  setPorts([{ path: 'COM8', friendlyName: 'HUAWEI PC UI' }, { path: 'COM9', friendlyName: 'HUAWEI Application' }]);
  await service.action('alice', 'connect'); assert.equal(service.modem.settings.control, 'COM8');
  setTime(90001); await service.scan(); assert.equal(service.owner, null);
});
test('history saves under the original owner once', async t => {
  const { service, saved } = setup(t); await service.action('alice', 'connect');
  service.modem.history = [{ id: 'one', number: '123' }];
  service.modem.emit('state'); service.modem.emit('state');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.length, 1); assert.equal(saved[0].owner, 'alice');
});
