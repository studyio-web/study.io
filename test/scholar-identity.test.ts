import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRawOAuthName,
  resolveScholarName,
  resolveScholarHandle,
} from '../src/lib/scholarIdentity';
import { UserProfile } from '../src/types';

describe('Scholar Identity & Google Account Privacy Specification', () => {
  it('correctly flags raw Google OAuth and institutional student registration names', () => {
    assert.strictEqual(isRawOAuthName('EBIN K A URK26CS7129'), true);
    assert.strictEqual(isRawOAuthName('2021BCS012'), true);
    assert.strictEqual(isRawOAuthName('RA2111003010123'), true);
    assert.strictEqual(isRawOAuthName('Ebin K A', 'Ebin K A'), true);
  });

  it('does NOT flag chosen scholar names or genuine in-app handles', () => {
    assert.strictEqual(isRawOAuthName('Scholar'), false);
    assert.strictEqual(isRawOAuthName('Silent Scholar'), false);
    assert.strictEqual(isRawOAuthName('Quantum Mind'), false);
    assert.strictEqual(isRawOAuthName('Ebin'), false);
    assert.strictEqual(isRawOAuthName(''), false);
    assert.strictEqual(isRawOAuthName(null), false);
  });

  it('guarantees Google account full name is strictly hidden and defaults to Scholar', () => {
    const rawGoogleUser: Partial<UserProfile> = {
      id: 'usr-123',
      email: 'ebink@karunya.edu.in',
      displayName: 'EBIN K A URK26CS7129',
      username: 'EBIN K A URK26CS7129',
      user_metadata: {
        full_name: 'EBIN K A URK26CS7129',
      },
    };

    const resolvedName = resolveScholarName(rawGoogleUser);
    assert.strictEqual(resolvedName, 'Scholar');

    const resolvedHandle = resolveScholarHandle(rawGoogleUser);
    assert.strictEqual(resolvedHandle, '');
  });

  it('allows user-customized in-app name to be displayed when set via Edit Profile', () => {
    const userWithCustomName: Partial<UserProfile> = {
      id: 'usr-123',
      email: 'ebink@karunya.edu.in',
      name: 'Silent Scholar',
      username: 'silentscholar',
      user_metadata: {
        full_name: 'EBIN K A URK26CS7129',
      },
    };

    assert.strictEqual(resolveScholarName(userWithCustomName), 'Silent Scholar');
    assert.strictEqual(resolveScholarHandle(userWithCustomName), 'silentscholar');
  });

  it('allows clean custom user handle when name is not explicitly set', () => {
    const userWithHandleOnly: Partial<UserProfile> = {
      id: 'usr-123',
      email: 'ebink@karunya.edu.in',
      username: 'cybermind',
      user_metadata: {
        full_name: 'EBIN K A URK26CS7129',
      },
    };

    assert.strictEqual(resolveScholarName(userWithHandleOnly), 'cybermind');
    assert.strictEqual(resolveScholarHandle(userWithHandleOnly), 'cybermind');
  });

  it('defaults gracefully to Scholar when user profile is null or undefined', () => {
    assert.strictEqual(resolveScholarName(null), 'Scholar');
    assert.strictEqual(resolveScholarName(undefined), 'Scholar');
    assert.strictEqual(resolveScholarHandle(null), '');
    assert.strictEqual(resolveScholarHandle(undefined), '');
  });
});
