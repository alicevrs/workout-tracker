import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import type { Food } from '../db/types';
import { barcodeVariants, lookupOpenFoodFacts } from '../lib/barcode';
import { BarcodeScanner } from './BarcodeScanner';
import { BrandLoader } from './BrandRing';
import { Sheet } from './ui';

type Problem = { code: string; text: string } | null;

/** Your own food with this barcode, if any. */
export async function ownFoodByBarcode(code: string): Promise<Food | undefined> {
  return db.foods.where('barcode').anyOf(barcodeVariants(code)).first();
}

/**
 * Scan → your own foods first, then Open Food Facts. `onFood` gets the food and whether it is new
 * (not stored yet). When nothing is found, the person can add the product as a new food.
 */
export function ScanFood({ open, onClose, onFood }: { open: boolean; onClose: () => void; onFood: (food: Food, isNew: boolean) => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem>(null);

  const find = async (code: string) => {
    setBusy(true);
    try {
      const own = await ownFoodByBarcode(code);
      if (own) return onFood(own, false);
      const r = await lookupOpenFoodFacts(code);
      if (r.status === 'found') return onFood(r.food, true);
      setProblem({
        code,
        text:
          r.status === 'offline'
            ? 'No connection: the product could not be looked up. Try again when online, or add it yourself.'
            : r.status === 'no_values'
              ? 'The product is in Open Food Facts but without nutrition values. Add it with the values of its label.'
              : 'This product is not in Open Food Facts yet. Add it with the values of its label.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BarcodeScanner open={open && !busy && !problem} onClose={onClose} onCode={(c) => void find(c)} />
      {open && busy && (
        <div className="scanner">
          <BrandLoader label="Looking up the product" />
        </div>
      )}
      <Sheet
        open={!!problem}
        onClose={() => {
          setProblem(null);
          onClose();
        }}
        title="Product not found"
      >
        <div className="stack">
          <p className="small" style={{ margin: 0 }}>
            {problem?.text}
          </p>
          <p className="tiny faint" style={{ margin: 0 }}>
            Barcode {problem?.code}
          </p>
          <div className="row">
            <button className="btn" onClick={() => setProblem(null)}>
              Scan again
            </button>
            <button className="btn primary" style={{ flex: 1 }} onClick={() => problem && navigate(`/nutrition/foods/new?barcode=${problem.code}`)}>
              Add as a new food
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
