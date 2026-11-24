import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSemver, compareSemver, isOlderVersion } from '../src/lib/appVersion';
import { GET as getAppVersion } from '../src/app/api/app-version/route';

describe('Mandatory App Update & Version Gate Specification', () => {
  describe('Semantic Version Parsing & Comparison', () => {
    it('accurately parses semantic version strings into numeric tuple arrays', () => {
      assert.deepEqual(parseSemver('2.5'), [2, 5]);
      assert.deepEqual(parseSemver('1.0.0'), [1, 0, 0]);
      assert.deepEqual(parseSemver('v2.5.1'), [2, 5, 1]);
      assert.deepEqual(parseSemver(''), [0]);
    });

    it('correctly compares version precedence across major, minor, and patch numbers', () => {
      // Older versions
      assert.ok(compareSemver('1.0', '2.5') < 0);
      assert.ok(compareSemver('2.4', '2.5') < 0);
      assert.ok(compareSemver('2.4.9', '2.5.0') < 0);
      assert.ok(compareSemver('2.5', '2.5.1') < 0);

      // Equal versions
      assert.equal(compareSemver('2.5', '2.5'), 0);
      assert.equal(compareSemver('2.5.0', '2.5'), 0);
      assert.equal(compareSemver('v2.5', '2.5'), 0);

      // Newer versions
      assert.ok(compareSemver('2.6', '2.5') > 0);
      assert.ok(compareSemver('3.0', '2.5') > 0);
      assert.ok(compareSemver('2.5.1', '2.5') > 0);
    });
  });

  describe('isOlderVersion Build & Version Evaluation', () => {
    it('detects older Android versionCode builds (e.g. build 1 vs required build 2)', () => {
      // Build 1 (v1.0 release) vs Build 2 (v2.5 release)
      assert.equal(isOlderVersion('1.0', '1', '2.5', '2'), true);
      assert.equal(isOlderVersion('2.5', '1', '2.5', '2'), true);
    });

    it('accepts matching or newer Android versionCode builds', () => {
      // Build 2 meets requirement
      assert.equal(isOlderVersion('2.5', '2', '2.5', '2'), false);
      // Build 3 is ahead of requirement
      assert.equal(isOlderVersion('2.6', '3', '2.5', '2'), false);
    });

    it('falls back to semantic version comparison if build code is unparsed or identical', () => {
      assert.equal(isOlderVersion('1.0', undefined, '2.5', undefined), true);
      assert.equal(isOlderVersion('2.5', undefined, '2.5', undefined), false);
      assert.equal(isOlderVersion('2.6', undefined, '2.5', undefined), false);
    });
  });

  describe('/api/app-version API Route Contract', () => {
    it('serves authoritative version definition with mandatory=true and min required version/build', async () => {
      const response = await getAppVersion();
      assert.equal(response.status, 200);

      const data = await response.json();
      assert.equal(data.version, '2.5');
      assert.equal(data.minRequiredBuild, 2);
      assert.equal(data.minRequiredVersion, '2.5');
      assert.equal(data.mandatory, true);
      assert.ok(data.downloadUrl.includes('studyio.apk'));
      assert.ok(data.apkSize.includes('MB'));
      assert.equal(response.headers.get('Cache-Control'), 'no-cache, no-store, must-revalidate');
    });
  });
});
