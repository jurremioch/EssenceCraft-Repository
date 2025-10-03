import { AnimatePresence, motion } from "framer-motion";

export interface DiceFace {
  id: string;
  label: string;
  raw: number;
  total: number;
  dc: number;
  success: boolean;
}

interface DiceOverlayProps {
  rolls: DiceFace[] | null;
}

export function DiceOverlay({ rolls }: DiceOverlayProps) {
  return (
    <AnimatePresence>
      {rolls && rolls.length > 0 ? (
        <motion.div
          key={rolls.map((face) => face.id).join("-")}
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          className="fixed bottom-6 right-6 z-50 flex gap-3"
        >
          {rolls.map((face) => (
            <motion.div
              key={face.id}
              initial={{ rotateX: -45, rotateY: 45 }}
              animate={{ rotateX: 0, rotateY: 0 }}
              transition={{ type: "spring", stiffness: 150, damping: 16 }}
              className="relative flex min-w-[140px] flex-col gap-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-xl"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {face.label}
              </div>
              <div className="text-3xl font-bold leading-none text-slate-900">
                {face.raw}
                <span className="ml-1 text-base font-medium text-slate-500">d20</span>
              </div>
              <div className="text-sm text-slate-600">
                Total {face.total} vs DC {face.dc}
              </div>
              <div className={face.success ? "text-emerald-600" : "text-rose-600"}>
                {face.success ? "Success" : "Fail"}
              </div>
            </motion.div>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
