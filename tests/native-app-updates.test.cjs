'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
test('native release selection, version ordering and download links', () => {
  const jdk = process.env.JAVA_HOME || path.resolve('.tools', fs.readdirSync('.tools').find(name => name.startsWith('jdk-')));
  const json = process.env.JSON_JAR || path.resolve('.tools/json.jar');
  const out = path.resolve('artifacts/app-updates/java');
  fs.mkdirSync(out, { recursive: true });
  execFileSync(path.join(jdk, 'bin/javac.exe'), ['-encoding', 'UTF-8', '-cp', json, '-d', out, 'app/src/main/java/com/vocast/app/AppUpdates.java', 'tests/AppUpdatesTest.java']);
  const result = execFileSync(path.join(jdk, 'bin/java.exe'), ['-Dfile.encoding=UTF-8', '-cp', [out, json].join(path.delimiter), 'com.vocast.app.AppUpdatesTest'], { encoding: 'utf8' });
  assert.match(result, /PASS native app updates/);
  console.log(result.trim());
});
