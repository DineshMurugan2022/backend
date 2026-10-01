const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: client } = require('socket.io-client');
const { GsmRelay } = require('../services/gsmRelay');
const { selectPorts, startAgent } = require('../../huawei-e173-test/lib/agent');
const { EventEmitter, once } = require('node:events');
const waitFor = async predicate => {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 30)); }
  assert.fail('Condition did not become true');
};

async function fixture(t, options = {}) {
  const server = http.createServer();
  const io = new Server(server);
  const relay = new GsmRelay(options);
  const cleanup = relay.attach(io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); cleanup(); await new Promise(resolve => io.close(resolve)); });
  const host = async code => {
    const socket = client(`${url}/gsm-agent`, { auth: { pairingCode: code }, transports: ['websocket'], reconnection: false });
    clients.push(socket); await once(socket, 'connect'); return socket;
  };
  return { relay, host, url };
}

test('two users get only their own devices, incoming state and outgoing commands', async t => {
  const { relay, host } = await fixture(t);
  const a = await host('A'.repeat(24)), b = await host('B'.repeat(24));
  a.emit('gsm:report', { state: { call: 'ringing', number: '111' }, devices: { ports: [{ path: 'COM4' }] } });
  b.emit('gsm:report', { state: { call: 'idle', number: '222' }, devices: { ports: [{ path: 'COM8' }] } });
  relay.pair('alice', 'A'.repeat(24)); relay.pair('bob', 'B'.repeat(24));
  await waitFor(() => relay.state('alice').number === '111');
  assert.equal(relay.state('bob').number, '222');
  assert.deepEqual(relay.devices('alice').ports, [{ path: 'COM4' }]);
  assert.deepEqual(relay.devices('bob').ports, [{ path: 'COM8' }]);
  assert.equal(relay.state('mallory').number, '');
  assert.deepEqual(relay.devices('mallory').ports, []);
  await assert.rejects(relay.action('mallory', 'answer'), /Pair/);
  const calls = [];
  a.on('gsm:execute', (data, ack) => { calls.push(['alice', data]); ack({ call: 'dialing' }); });
  b.on('gsm:execute', (data, ack) => { calls.push(['bob', data]); ack({ call: 'active' }); });
  await relay.action('alice', 'dial', { number: '123456', userId: 'bob' });
  await relay.action('bob', 'answer');
  assert.deepEqual(calls.map(c => c[0]), ['alice', 'bob']);
  assert.throws(() => relay.pair('mallory', 'A'.repeat(24)), /invalid/);
  await assert.rejects(relay.action('alice', 'toString'), /Unknown/);
});

test('lease expiry, logout release, agent disconnect and expired pairing fail closed', async t => {
  let time = 100;
  const { relay, host } = await fixture(t, { now: () => time });
  const a = await host('C'.repeat(24));
  relay.pair('alice', 'C'.repeat(24));
  const released = once(a, 'gsm:release');
  time += 90001; relay.sweep(); await released;
  assert.equal(relay.state('alice').isHostOnline, false);
  await assert.rejects(relay.action('alice', 'dial'), /Pair/);
  const b = await host('D'.repeat(24)); relay.pair('bob', 'D'.repeat(24));
  b.disconnect(); await waitFor(() => !relay.state('bob').isHostOnline);
  await host('E'.repeat(24)); time += 600001;
  assert.throws(() => relay.pair('charlie', 'E'.repeat(24)), /expired/);
});

test('completed calls persist once for the paired owner despite repeated snapshots', async t => {
  const saved = [];
  const { relay, host } = await fixture(t, { saveCall: async (owner, entry) => saved.push({ owner, id: entry.id }) });
  const a = await host('F'.repeat(24)); relay.pair('alice', 'F'.repeat(24));
  const report = { state: { history: [{ id: 'call-1', number: '123', duration: 2 }] } };
  a.emit('gsm:report', report); a.emit('gsm:report', report);
  await waitFor(() => saved.length === 1);
  assert.deepEqual(saved, [{ owner: 'alice', id: 'call-1' }]);
});

test('automatic detection ignores unrelated ports and refuses ambiguous modems', () => {
  const p = (path, friendlyName) => ({ path, friendlyName, vendorId: '12d1' });
  const ports = [p('COM4', 'HUAWEI PC UI'), p('COM5', 'HUAWEI Application'), { path: 'COM1' }];
  assert.equal(selectPorts(ports).control, 'COM4');
  assert.equal(selectPorts(ports).voice, 'COM5');
  assert.throws(() => selectPorts([{ path: 'COM1' }]), /Huawei/);
  assert.throws(() => selectPorts([...ports, p('COM6', 'HUAWEI PC UI')]), /choose/);
  assert.throws(() => selectPorts(ports, { control: 'COM1', voice: 'COM5' }), /choose/);
});

test('actual agent pairs, controls only its modem and clears private history on release', async t => {
  const { relay, url } = await fixture(t);
  const modem = new EventEmitter();
  modem.state = { call: 'idle', connected: false }; modem.history = []; modem.logs = [];
  modem.snapshot = () => ({ ...modem.state, history: modem.history, settings: modem.settings });
  modem.update = patch => { Object.assign(modem.state, patch); modem.emit('state', modem.snapshot()); };
  modem.disconnect = async () => modem.update({ call: 'idle', connected: false });
  modem.connect = async settings => { modem.settings = settings; modem.update({ connected: true, error: '' }); };
  modem.dial = async number => modem.update({ call: 'dialing', number });
  const agent = startAgent(modem, { backendUrl: url, io: client, onCode: () => {}, audioDevices: () => [],
    listPorts: async () => [{ path: 'COM4', friendlyName: 'HUAWEI PC UI' }, { path: 'COM5', friendlyName: 'HUAWEI Application' }] });
  t.after(() => agent.stop());
  await waitFor(() => agent.status().online);
  relay.pair('alice', agent.status().code);
  await waitFor(() => agent.status().paired);
  await relay.action('alice', 'connect', {});
  await relay.action('alice', 'dial', { number: '123456' });
  assert.equal(modem.state.number, '123456');
  modem.history = [{ id: 'private', number: '123456' }];
  relay.release('alice');
  await waitFor(() => !agent.status().paired && modem.history.length === 0);
  assert.equal(modem.state.connected, false);
  assert.equal(modem.state.number, '');
});


test('agent detects insert, removal, and changed COM numbers without another pairing', async t => {
  const { relay, url } = await fixture(t);
  let ports = [];
  const modem = new EventEmitter();
  modem.state = { call: 'idle', connected: false }; modem.history = []; modem.logs = [];
  modem.snapshot = () => ({ ...modem.state, settings: modem.settings });
  modem.update = patch => { Object.assign(modem.state, patch); modem.emit('state', modem.snapshot()); };
  modem.disconnect = async () => modem.update({ call: 'idle', connected: false });
  modem.connect = async settings => { modem.settings = settings; modem.update({ connected: true, error: '' }); };
  const agent = startAgent(modem, { backendUrl: url, io: client, onCode: () => {}, audioDevices: () => [], scanInterval: 25,
    listPorts: async () => ports });
  t.after(() => agent.stop());
  await waitFor(() => agent.status().online);
  relay.pair('alice', agent.status().code);
  ports = [{ path: 'COM4', friendlyName: 'HUAWEI PC UI' }, { path: 'COM5', friendlyName: 'HUAWEI Application' }];
  await waitFor(() => modem.state.connected);
  assert.equal(modem.settings.control, 'COM4');
  ports = []; await waitFor(() => !modem.state.connected);
  ports = [{ path: 'COM8', friendlyName: 'HUAWEI PC UI' }, { path: 'COM9', friendlyName: 'HUAWEI Application' }];
  await waitFor(() => modem.state.connected);
  assert.equal(modem.settings.control, 'COM8');
  assert.equal(relay.state('alice').isHostOnline, true);
  await relay.action('alice', 'disconnect');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(modem.state.connected, false, 'explicit disconnect disables automatic reconnect');
});
