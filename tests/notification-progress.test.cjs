const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');

for (const name of ['PlaybackMediaProgress', 'AppSession']) {
  test('native ' + name + ' behavior', () => {
    const jdk = process.env.JAVA_HOME || path.resolve('.tools', fs.readdirSync('.tools').find(name => name.startsWith('jdk-')));
    const out = path.resolve('artifacts/notification-progress/java');
    fs.mkdirSync(out, { recursive: true });
    execFileSync(path.join(jdk, 'bin/javac.exe'), ['-encoding', 'UTF-8', '-d', out,
      'app/src/main/java/com/vocast/app/' + name + '.java', 'tests/' + name + 'Test.java']);
    assert.match(execFileSync(path.join(jdk, 'bin/java.exe'), ['-cp', out, 'com.vocast.app.' + name + 'Test'], { encoding: 'utf8' }), /PASS/);
  });
}
