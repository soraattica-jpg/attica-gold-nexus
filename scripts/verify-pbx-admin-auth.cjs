const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.createSourceFile('server.js', fs.readFileSync('/root/attica-api/server.js', 'utf8'), ts.ScriptTarget.Latest, true);
const node = source.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === 'getConfiguredSipPassword');
assert.ok(node);
let reads = 0;
const context = vm.createContext({
  PJSIP_CONF_PATH: 'mock-pjsip',
  readFileSync: () => {
    reads += 1;
    return '[1001](webrtc-endpoint)\nauth=1001-auth\n[1001-auth](webrtc-auth)\nusername=1001\npassword=admin-test-only\n[1002-auth]\nusername=1002\n[1003-auth]\npassword=other-test-only\n';
  },
});
vm.runInContext(node.getText(source), context);
assert.equal(context.getConfiguredSipPassword('1001'), 'admin-test-only');
assert.equal(context.getConfiguredSipPassword('1002'), '');
assert.equal(context.getConfiguredSipPassword('1007'), '');
assert.equal(context.getConfiguredSipPassword('1003'), 'other-test-only');
reads = 0;
assert.equal(context.getConfiguredSipPassword(''), '');
assert.equal(context.getConfiguredSipPassword('1001\npassword=bad'), '');
assert.equal(reads, 0);
console.log('6 PBX credential lookup checks passed; no credentials changed.');
