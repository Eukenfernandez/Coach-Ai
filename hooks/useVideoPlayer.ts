import { useState, useRef, useCallback, RefObject } from 'react';

interface UseVideoPlayerOptions {
    initialPlaybackRate?: number;
}

interface UseVideoPlayerReturn {
    videoRef: RefObject<HTMLVideoElement>;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
    playbackRate: number;
    isScrubbing: boolean;
    setCurrentTime: (time: number) => void;
    setIsScrubbing: (scrubbing: boolean) => void;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seek: (time: number) => void;
    frameStep: (direction: 'prev' | 'next') => void;
    cyclePlaybackRate: () => void;
    handleLoadedData: () => void;
    handleTimeUpdate: () => void;
}

const PLAYBACK_RATES = [0.25, 0.5, 1];

/**
 * Custom hook for managing video playback state and controls.
 * Extracts common video player logic for reusability.
 */
export function useVideoPlayer(options: UseVideoPlayerOptions = {}): UseVideoPlayerReturn {
    const { initialPlaybackRate = 1 } = options;

    const videoRef = useRef<HTMLVideoElement>(null);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(initialPlaybackRate);
    const [isScrubbing, setIsScrubbing] = useState(false);

    const handleLoadedData = useCallback(() => {
        if (videoRef.current) {
            setDuration(videoRef.current.duration);
        }
    }, []);

    const handleTimeUpdate = useCallback(() => {
        if (videoRef.current && !isScrubbing) {
            setCurrentTime(videoRef.current.currentTime);
        }
    }, [isScrubbing]);

    const play = useCallback(() => {
        videoRef.current?.play();
        setIsPlaying(true);
    }, []);

    const pause = useCallback(() => {
        videoRef.current?.pause();
        setIsPlaying(false);
    }, []);

    const togglePlay = useCallback(() => {
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    }, [isPlaying, play, pause]);

    const seek = useCallback((time: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = time;
            setCurrentTime(time);
        }
    }, []);

    const frameStep = useCallback((direction: 'prev' | 'next') => {
        const dt = 1 / 30; // Assuming 30fps
        const mod = direction === 'next' ? dt : -dt;
        if (videoRef.current) {
            videoRef.current.currentTime += mod;
            setCurrentTime(videoRef.current.currentTime);
        }
    }, []);

    const cyclePlaybackRate = useCallback(() => {
        const currentIndex = PLAYBACK_RATES.indexOf(playbackRate);
        const nextIndex = (currentIndex + 1) % PLAYBACK_RATES.length;
        const newRate = PLAYBACK_RATES[nextIndex];
        setPlaybackRate(newRate);
        if (videoRef.current) {
            videoRef.current.playbackRate = newRate;
        }
    }, [playbackRate]);

    return {
        videoRef,
        currentTime,
        duration,
        isPlaying,
        playbackRate,
        isScrubbing,
        setCurrentTime,
        setIsScrubbing,
        play,
        pause,
        togglePlay,
        seek,
        frameStep,
        cyclePlaybackRate,
        handleLoadedData,
        handleTimeUpdate,
    };
}
