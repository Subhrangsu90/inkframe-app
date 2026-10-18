import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { EditorPreferences } from './editor-preferences';

describe('EditorPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('shows the ruler unless it was turned off, and remembers the choice', () => {
    expect(TestBed.inject(EditorPreferences).showRuler()).toBe(true);
    TestBed.inject(EditorPreferences).setShowRuler(false);
    expect(TestBed.inject(EditorPreferences).showRuler()).toBe(false);

    TestBed.resetTestingModule();
    expect(TestBed.inject(EditorPreferences).showRuler()).toBe(false);
    TestBed.inject(EditorPreferences).setShowRuler(true);
    expect(localStorage.getItem('inkframe-show-ruler')).toBeNull();
  });
});
