const dgram = require('dgram');
const crypto = require('crypto');

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

const username = '102597701';
const password = process.env.SIP_PASSWORD || '';
if (!password) { console.error('Set SIP_PASSWORD in environment'); process.exit(1); }
const realm = 'sip2.cloud-connect.in';

function sendUDP(msg) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const timer = setTimeout(() => { sock.close(); resolve('TIMEOUT'); }, 4000);
    sock.on('message', (m) => { clearTimeout(timer); sock.close(); resolve(m.toString()); });
    sock.on('error', (e) => { clearTimeout(timer); reject(e); });
    sock.send(msg, 7065, 'sip2.cloud-connect.in');
  });
}

async function register() {
  const callId = 'crmreg_' + Date.now();
  
  // Step 1: plain REGISTER to get 401 challenge
  const step1 = await sendUDP(
    'REGISTER sip:sip2.cloud-connect.in:7065 SIP/2.0\r\n' +
    'Via: SIP/2.0/UDP 127.0.0.1:5060;branch=z9hG4bKstep1' + Date.now() + ';rport\r\n' +
    'Max-Forwards: 70\r\n' +
    'To: <sip:' + username + '@sip2.cloud-connect.in:7065>\r\n' +
    'From: <sip:' + username + '@sip2.cloud-connect.in:7065>;tag=crmtag1\r\n' +
    'Call-ID: ' + callId + '\r\n' +
    'CSeq: 1 REGISTER\r\n' +
    'Contact: <sip:' + username + '@127.0.0.1:5060>\r\n' +
    'Expires: 300\r\n' +
    'Content-Length: 0\r\n\r\n'
  );
  
  console.log('Step1 response:', step1.split('\r\n')[0]);
  
  // Extract nonce
  const nonceMatch = step1.match(/nonce="([^"]+)"/);
  if (!nonceMatch) { 
    console.log('No nonce found in response'); 
    console.log('Full response:', step1);
    return; 
  }
  const nonce = nonceMatch[1];
  console.log('Got nonce:', nonce);

  // Compute Digest auth
  const uri = 'sip:sip2.cloud-connect.in:7065';
  const nc = '00000001';
  const cnonce = 'crm' + Math.floor(Math.random() * 1000000).toString(16);
  
  const h1 = md5(username + ':' + realm + ':' + password);
  const h2 = md5('REGISTER:' + uri);
  const response = md5(h1 + ':' + nonce + ':' + nc + ':' + cnonce + ':auth:' + h2);

  const authHeader = 'Digest username="' + username + '",realm="' + realm + 
    '",nonce="' + nonce + '",uri="' + uri + '",nc=' + nc + 
    ',cnonce="' + cnonce + '",qop=auth,response="' + response + '",algorithm=MD5';
  
  const step2 = await sendUDP(
    'REGISTER sip:sip2.cloud-connect.in:7065 SIP/2.0\r\n' +
    'Via: SIP/2.0/UDP 127.0.0.1:5060;branch=z9hG4bKstep2' + Date.now() + ';rport\r\n' +
    'Max-Forwards: 70\r\n' +
    'To: <sip:' + username + '@sip2.cloud-connect.in:7065>\r\n' +
    'From: <sip:' + username + '@sip2.cloud-connect.in:7065>;tag=crmtag1\r\n' +
    'Call-ID: ' + callId + '\r\n' +
    'CSeq: 2 REGISTER\r\n' +
    'Contact: <sip:' + username + '@127.0.0.1:5060>\r\n' +
    'Authorization: ' + authHeader + '\r\n' +
    'Expires: 300\r\n' +
    'Content-Length: 0\r\n\r\n'
  );
  
  console.log('Step2 (auth) response:', step2.split('\r\n')[0]);
  console.log('Full Step2:', step2.substring(0, 800));
}

register().catch(console.error);
