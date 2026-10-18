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

  it('remembers the zoom, and reads anything unexpected as auto', () => {
    expect(TestBed.inject(EditorPreferences).zoom()).toBe('auto');
    TestBed.inject(EditorPreferences).setZoom(1.5);
    TestBed.resetTestingModule();
    expect(TestBed.inject(EditorPreferences).zoom()).toBe(1.5);

    TestBed.inject(EditorPreferences).setZoom('fit');
    TestBed.resetTestingModule();
    expect(TestBed.inject(EditorPreferences).zoom()).toBe('fit');

    localStorage.setItem('inkframe-zoom', 'huge');
    TestBed.resetTestingModule();
    expect(TestBed.inject(EditorPreferences).zoom()).toBe('auto');
  });
});
