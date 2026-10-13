// Exercise templates: ready-made blocks (one or more exercises with sets, reps, weights and timer
// settings) that can be dropped into workout templates. Adding one copies it, so later edits to
// the template do not change workouts that already use it.

import type { Block, BlockFormat, BlockTemplate } from '../db/types';
import { uid } from './ids';
import { cloneBlock, FORMAT_INFO, newBlock } from './program';

export function newBlockTemplate(format: BlockFormat = 'sets_reps', prepSec = 10, name = 'New exercise template'): BlockTemplate {
  const now = Date.now();
  return { id: uid(), name, block: newBlock(format, prepSec), createdAt: now, updatedAt: now };
}

/** Save an existing block as a new template. */
export function templateFromBlock(block: Block, name = block.name ?? FORMAT_INFO[block.format].label): BlockTemplate {
  const now = Date.now();
  const copy = cloneBlock(block);
  delete copy.name;
  return { id: uid(), name, block: copy, createdAt: now, updatedAt: now };
}

export function duplicateTemplate(t: BlockTemplate): BlockTemplate {
  const now = Date.now();
  return { ...structuredClone(t), id: uid(), name: `${t.name} (copy)`, block: cloneBlock(t.block), createdAt: now, updatedAt: now };
}

/** The block to insert into a workout: a fresh copy named after the template. */
export function blockFromTemplate(t: BlockTemplate): Block {
  return { ...cloneBlock(t.block), name: t.name };
}
