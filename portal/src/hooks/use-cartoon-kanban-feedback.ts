'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    isCelebrationStage,
    isLostStage,
    playCartoonSound,
} from '@/lib/cartoon-effects';
import { isSuiteBoardEffectsEnabled } from '@/lib/suite-appearance';

type StageMoveOptions = {
    probability?: number;
};

export function useCartoonKanbanFeedback() {
    const [celebrationTick, setCelebrationTick] = useState(0);
    const [landedId, setLandedId] = useState<string | null>(null);
    const [pulseColumn, setPulseColumn] = useState<string | null>(null);
    const dragActiveRef = useRef(false);
    const hoverColumnRef = useRef<string | null>(null);
    const landTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        return () => {
            if (landTimerRef.current) clearTimeout(landTimerRef.current);
        };
    }, []);

    const triggerStageMove = useCallback(
        (recordId: string, columnKey: string, stageName: string, options?: StageMoveOptions) => {
            if (landTimerRef.current) clearTimeout(landTimerRef.current);
            setLandedId(recordId);
            setPulseColumn(columnKey);
            dragActiveRef.current = false;

            const effectsOn = isSuiteBoardEffectsEnabled();

            if (isCelebrationStage(stageName, options)) {
                if (effectsOn) {
                    playCartoonSound('win');
                    setCelebrationTick((t) => t + 1);
                }
            } else if (isLostStage(stageName)) {
                if (effectsOn) playCartoonSound('lose');
            } else if (effectsOn) {
                playCartoonSound('drop');
            }

            landTimerRef.current = setTimeout(() => {
                setLandedId(null);
                setPulseColumn(null);
            }, 520);
        },
        [],
    );

    const onDragStart = useCallback((e: React.DragEvent, recordId: string, dataKey: string) => {
        e.dataTransfer.setData(dataKey, recordId);
        e.dataTransfer.effectAllowed = 'move';
        dragActiveRef.current = true;
        hoverColumnRef.current = null;
        playCartoonSound('pickup');
    }, []);

    const onDragOver = useCallback((e: React.DragEvent, columnKey?: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (columnKey && hoverColumnRef.current !== columnKey) {
            hoverColumnRef.current = columnKey;
            playCartoonSound('hover', 0.65);
        }
    }, []);

    const onDragEnd = useCallback(() => {
        if (dragActiveRef.current) playCartoonSound('cancel');
        dragActiveRef.current = false;
        hoverColumnRef.current = null;
    }, []);

    const markDropHandled = useCallback(() => {
        dragActiveRef.current = false;
    }, []);

    return {
        celebrationTick,
        landedId,
        pulseColumn,
        triggerStageMove,
        onDragStart,
        onDragOver,
        onDragEnd,
        markDropHandled,
    };
}
