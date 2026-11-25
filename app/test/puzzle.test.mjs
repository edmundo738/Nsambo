import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPuzzleState, pickKey, tryExitDoor, validatePuzzle } from '../src/backrooms/game/puzzle.js'

test('puzzle: começar — porta trancada, sem chave', () => {
  const s = createPuzzleState()
  assert.equal(s.hasKey, false)
  assert.equal(s.doorOpen, false)
  assert.equal(validatePuzzle(s).ok, true)
})

test('puzzle: tentar a porta sem chave → trancada, contador incrementa', () => {
  const s = createPuzzleState()
  const { state, result } = tryExitDoor(s)
  assert.equal(result, 'locked')
  assert.equal(state.doorOpen, false)
  assert.equal(state.lockedNudges, 1)
  assert.equal(validatePuzzle(state).ok, true)
})

test('puzzle: apanhar a chave uma vez (idempotente)', () => {
  let s = createPuzzleState()
  s = pickKey(s); s = pickKey(s)
  assert.equal(s.hasKey, true)
  assert.equal(s.steps, 1)
})

test('puzzle: fluxo completo chave → porta → aberta', () => {
  let s = createPuzzleState()
  s = pickKey(s)
  const { state, result } = tryExitDoor(s)
  assert.equal(result, 'unlocked')
  assert.equal(state.doorOpen, true)
  assert.equal(state.exitUnlocked, true)
  assert.equal(validatePuzzle(state).ok, true)
  // usar de novo é inofensivo
  const again = tryExitDoor(state)
  assert.equal(again.result, 'already')
})

test('puzzle: validador rejeita estado impossível', () => {
  const bad = { ...createPuzzleState(), exitUnlocked: true, hasKey: false, doorOpen: false }
  assert.equal(validatePuzzle(bad).ok, false)
  const bad2 = { ...createPuzzleState(), doorOpen: true, exitUnlocked: false }
  assert.equal(validatePuzzle(bad2).ok, false)
})
