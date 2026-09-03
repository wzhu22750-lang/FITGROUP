/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Dumbbell } from 'lucide-react';
import FuzzyText from './FuzzyText';

interface SplashAnimationProps {
  onComplete: () => void;
}

/**
 * Clean, minimal, high-impact neo-brutalist splash animation for FitGroup.
 * Fast & snappy (~1.4s total, tap to dismiss).
 */
export default function SplashAnimation({ onComplete }: SplashAnimationProps) {
  const [stage, setStage] = useState(0);
  const completedRef = useRef(false);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // Click to dismiss immediately
  const handleDismiss = useCallback(() => {
    setStage(3);
    setTimeout(finish, 120);
  }, [finish]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Stage 1: Icon pops in (100ms)
    timers.push(setTimeout(() => setStage(1), 100));

    // Stage 2: FuzzyText & Tagline reveal (300ms)
    timers.push(setTimeout(() => setStage(2), 300));

    // Stage 3: Smooth exit transition (950ms)
    timers.push(setTimeout(() => setStage(3), 950));

    // Complete callback (1150ms)
    timers.push(setTimeout(finish, 1150));

    return () => timers.forEach(clearTimeout);
  }, [finish]);

  return (
    <AnimatePresence>
      {stage < 3 && (
        <motion.div
          className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black text-white select-none cursor-pointer ${
            stage >= 3 ? 'pointer-events-none' : ''
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.98, pointerEvents: 'none' }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={handleDismiss}
        >
          <div className="flex flex-col items-center gap-5">
            {/* Dumbbell Icon Badge */}
            <AnimatePresence>
              {stage >= 1 && (
                <motion.div
                  initial={{ scale: 0.6, opacity: 0, y: 15 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 380,
                    damping: 24,
                  }}
                  className="border-2 border-white bg-black p-4 shadow-[4px_4px_0px_0px_#FFFFFF]"
                >
                  <Dumbbell size={44} className="text-white" strokeWidth={2.6} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Brand Title with Clean FuzzyText Effect */}
            <div className="min-h-[64px] flex items-center justify-center">
              {stage >= 2 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  <FuzzyText
                    fontSize="clamp(2.2rem, 9vw, 3.2rem)"
                    fontWeight={900}
                    fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                    color="#FFFFFF"
                    baseIntensity={0.10}
                    hoverIntensity={0.30}
                    fuzzRange={12}
                    direction="horizontal"
                    glitchMode={false}
                    letterSpacing={4}
                  >
                    FITGROUP
                  </FuzzyText>
                </motion.div>
              )}
            </div>

            {/* Clean Tagline */}
            <AnimatePresence>
              {stage >= 2 && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.55 }}
                  transition={{ duration: 0.35, delay: 0.15 }}
                  className="text-xs tracking-[0.3em] font-medium uppercase text-white"
                >
                  一起健身 · 一起打卡
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
