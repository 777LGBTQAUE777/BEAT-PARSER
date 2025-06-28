// --- switchToNextTrack ---
// (перемещено внутрь App после объявления всех зависимостей)
import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import './App.css';
import backgroundImage from './assets/background.png';
import catImage from './assets/cat.png';


// --- Все базовые ref-переменные объявляются сразу после объявления App --- 
// (этот блок переносится внутрь функции App, сразу после const App: React.FC = () => { )


// Toast-уведомление для критических ошибок
const Toast: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
  <div className="toast-error" onClick={onClose}>
    <span>❌ {message}</span>
  </div>
);

// Хук для обработки ошибок и показа toast
function useErrorHandler() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showError = useCallback((msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 5000);
  }, []);

  // Для критических ошибок — toast, для остальных — только лог
  const handleError = useCallback((error: any, critical = false, userMsg?: string) => {
    console.error(error);
    if (critical) {
      showError(userMsg || 'Произошла критическая ошибка');
    }
  }, [showError]);

  return { errorMessage, showError, handleError };
}

// Безопасные обёртки для localStorage
function safeSetLocalStorage(key: string, value: any, handleError: (e: any, c?: boolean, m?: string) => void) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    handleError(e, false, 'Ошибка сохранения данных');
  }
}
function safeGetLocalStorage(key: string, handleError: (e: any, c?: boolean, m?: string) => void) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : null;
  } catch (e) {
    handleError(e, false, 'Ошибка чтения данных');
    return null;
  }
}

// fetch с автоматическим повтором
async function fetchWithRetry(url: string, options: any, retries = 2, handleError: (e: any, c?: boolean, m?: string) => void) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries) {
        handleError(e, true, 'Ошибка сети. Проверьте соединение.');
        throw e;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}


// Splash master scenes
const SPLASH_KEY = 'yt_api_key';
const splashScenes = [
  {
    title: 'Добро пожаловать в beatparser!',
    button: 'Дальше →',
  },
  {
    title: 'Сёрфить YouTube в поисках подходящего бита долго и неудобно. Beatparser собирает чистый список инструменталов, а ручное «тыкание» по YouTube убивает вдохновение; поток Beatparser крутит подходящие биты один за другим, оставляя тебе только лайкнуть понравившееся.',
    subtitle: 'Быстрое переключение по ключевым словам, автоматическая фильтрация спама, экономия времени.',
    button: 'Дальше →',
  },
  {
    title: 'Работает это так: Beatparser шепчет YouTube-у твой запрос, тут же рубит клипы, рекламу и чересчур длинные треки, складывает чистые инструменталы в локальный кеш, — и сразу запускает поток: каждые 30 с, 60 с или после полного проигрыша бит плавно сменяется следующим. Ты просто слушаешь и ставишь «сердце» тем, кто зацепил; всё остальное — переключения, пропуски, экономия квоты API — происходит за кадром, без единого лишнего клика.',
    subtitle: 'Все данные остаются локально, без серверного бэкенда — сервис быстрее и приватнее обычного YouTube-поиска.',
    button: 'Дальше →',
  },
  {
    title: 'Чтобы начать создавать и собирать плейлисты, введите свой YouTube API-ключ',
    input: true,
    button: 'Сохранить и начать',
    hint: 'Действующий ключ лежит в файле README.md, резервный ключ продублирован в диалоге с @Nmethylamine в Telegram',
  },
];

// ...existing code...

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface Beat {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  addedAt?: number;
}

interface CacheData {
  beats: Beat[];
  timestamp: number;
  searchTags: string[];
}

type StreamMode = 'disabled' | '30' | '60' | 'full';
type DurationFilter = 'short' | 'medium' | 'long';

// Упрощённый компонент кнопки потока (без circle progress ring)
interface StreamButtonProps {
  streamMode: StreamMode;
  streamStatus: 'active' | 'paused' | 'disabled';
  streamCountdown: number;
  onClick: () => void;
  getStreamModeText: (mode: StreamMode) => string;
}

const StreamButton: React.FC<StreamButtonProps> = ({
  streamMode,
  streamStatus,
  streamCountdown,
  onClick,
  getStreamModeText
}) => {
  return (
    <div className="stream-button-wrapper">
      <button 
        onClick={onClick}
        className="control-button stream-button"
        title="Настроить автоматическое переключение треков"
      >
        ⚙️ Поток по треку ({getStreamModeText(streamMode)})
        {streamStatus === 'active' && streamMode !== 'disabled' && streamMode !== 'full' && (
          <span className="stream-countdown"> - {Math.ceil(streamCountdown)}с</span>
        )}
      </button>
    </div>
  );
};

// --- FavoriteButton ---
interface FavoriteButtonProps {
  isFavorite: boolean;
  onClick: () => void;
}

const FavoriteButton: React.FC<FavoriteButtonProps> = ({ isFavorite, onClick }) => {
  const [animating, setAnimating] = useState(false);
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    if (filled) {
      const timeout = setTimeout(() => setFilled(false), 1200);
      return () => clearTimeout(timeout);
    }
  }, [filled]);
  const handleClick = () => {
    setAnimating(true);
    setFilled(true);
    if (onClick) onClick();
    setTimeout(() => setAnimating(false), 400);
  };
  return (
    <button
      onClick={handleClick}
      className={`control-btn favorite-btn${filled ? ' filled' : ''}${animating ? ' heart-anim' : ''}`}
      title="Добавить трек в избранное"
      tabIndex={0}
      aria-pressed={!!isFavorite}
      style={{ outline: 'none', background: 'none', border: 'none', padding: 0, margin: 0 }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24">
        <path
          className="heart-fill"
          d="M12 21s-6.5-5.5-8.5-8.5A5.5 5.5 0 0 1 12 5.5a5.5 5.5 0 0 1 8.5 7C18.5 15.5 12 21 12 21z"
          fill={filled || isFavorite ? '#ff2222' : 'none'}
          stroke="#ff2222"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

// Easter Cat Toast
const EasterCatToast: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="toast-easter" onClick={onClose} style={{ zIndex: 1001 }}>
    <span style={{ fontFamily: 'Montserrat Black, Montserrat, Arial', fontWeight: 900, display: 'block' }}>Выполнил</span>
    <span style={{ fontFamily: 'Montserrat Light, Montserrat, Arial', fontWeight: 300, display: 'block' }}>&nbsp;: Федурин Матвей</span>
    <br />
    <span style={{ fontFamily: 'Montserrat Black, Montserrat, Arial', fontWeight: 900, display: 'block' }}>Группа</span>
    <span style={{ fontFamily: 'Montserrat Light, Montserrat, Arial', fontWeight: 300, display: 'block' }}>&nbsp;: 9-ИС205</span>
    <br />
    <span style={{ fontFamily: 'Montserrat Black, Montserrat, Arial', fontWeight: 900, display: 'block' }}>телеграм</span>
    <span style={{ fontFamily: 'Montserrat Light, Montserrat, Arial', fontWeight: 300, display: 'block' }}>&nbsp;: @Nmethylamine</span>
  </div>
);

// --- MAIN COMPONENT ---
const App: React.FC = () => {
  // --- Все базовые ref-переменные объявляются сразу после объявления App ---
  // --- Все базовые ref-переменные ---
  const beatsRef = useRef<Beat[]>([]);
  const currentIndexRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const streamModeRef = useRef<StreamMode>('disabled');
  const streamStatusRef = useRef<'active' | 'paused' | 'disabled'>('disabled');
  const streamTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const readyCheckRef = useRef<NodeJS.Timeout | null>(null);

  // --- SPLASH MASTER STATE ---
  const [showSplash, setShowSplash] = useState(() => !localStorage.getItem(SPLASH_KEY));
  const [splashStep, setSplashStep] = useState(0);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [userApiKey, setUserApiKey] = useState<string>(() => localStorage.getItem(SPLASH_KEY) || '');

  // ...existing state...
  const [searchQuery, setSearchQuery] = useState('');
  // --- carousel для placeholder с вертикальным слайдером ---
  const carouselWords = ["артиста", "жанр", "стиль", "или оставьте пустым"];
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [isSliding, setIsSliding] = useState(false);
  useEffect(() => {
    const interval = setInterval(() => {
      setIsSliding(true);
      setTimeout(() => {
        setCarouselIndex((prev) => (prev + 1) % carouselWords.length);
        setIsSliding(false);
      }, 350); // длительность анимации
    }, 1200);
    return () => clearInterval(interval);
  }, []);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [streamMode, setStreamMode] = useState<StreamMode>('disabled');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('medium');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [shownBeats, setShownBeats] = useState<Set<string>>(new Set());
  const [userInteracted, setUserInteracted] = useState(false);
  const [apiLoaded, setApiLoaded] = useState(false);
  const [pendingVideoLoad, setPendingVideoLoad] = useState<Beat | null>(null);
  const [playerInitialized, setPlayerInitialized] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [showDurationModal, setShowDurationModal] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [cachedBeats, setCachedBeats] = useState<Beat[]>([]);
  const [extractedTags, setExtractedTags] = useState<string[]>([]);
  const [quotaUsage, setQuotaUsage] = useState(0);
  const [favorites, setFavorites] = useState<Beat[]>([]);
  const [hoveredFavorite, setHoveredFavorite] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<'active' | 'paused' | 'disabled'>('disabled');
  const [streamCountdown, setStreamCountdown] = useState<number>(0);
  const [streamNotifications, setStreamNotifications] = useState<string[]>([]);
  const [showEasterToast, setShowEasterToast] = useState(false);
  const [catAnimPhase, setCatAnimPhase] = useState<'idle'|'left'|'right'|'center'>('idle');
  const catAnimTimeout = useRef<NodeJS.Timeout|null>(null);
  const catAnimInterval = useRef<NodeJS.Timeout|null>(null);


  // Splash переход между сценами
  const nextSplash = () => {
    setSplashLeaving(true);
    setTimeout(() => {
      setSplashLeaving(false);
      setSplashStep((prev) => prev + 1);
    }, 220);
  };

  // Splash финал: сохранить ключ и скрыть мастер
  const handleSaveApiKey = () => {
    localStorage.setItem(SPLASH_KEY, apiKeyInput.trim());
    setUserApiKey(apiKeyInput.trim());
    setSplashLeaving(true);
    setTimeout(() => {
      setShowSplash(false);
      setSplashLeaving(false);
    }, 220);
  };

  // Если ключ уже есть — скрыть мастер
  useEffect(() => {
    if (userApiKey && userApiKey.length > 30) setShowSplash(false);
  }, [userApiKey]);

  // useErrorHandler должен быть вызван сразу после useState
  const { errorMessage, showError, handleError } = useErrorHandler();

  // (Удалены дублирующиеся ref-переменные)


  const localKey = 'beatparser_favorites';
  const cacheKey = 'beatparser_cache';
  const quotaKey = 'beatparser_quota';

  // --- API KEY LOGIC ---
  // Используем ключ: сначала пользовательский, потом из env
  const API_KEY = userApiKey || process.env.REACT_APP_YOUTUBE_API_KEY;

  const beatKeywords = [
    'type beat', 'free for profit', 'free beat', 'beat', 'instrumental', 
    'prod by', 'produced by', 'beats'
  ];

  const excludeWords = [
    'the', 'and', 'of', 'in', 'for', 'with', 'by', 'a', 'an', 'is', 'are',
    'free', 'download', 'subscribe', 'like', 'comment', 'share', 'new', 'latest'
  ];

  const durationOptions = [
    { value: 'short', label: 'До 2 минут', description: 'Короткие биты (до 2 мин)' },
    { value: 'medium', label: 'От 2 до 4 минут', description: 'Средние биты (2–4 мин)' },
    { value: 'long', label: 'От 4 до 12 минут', description: 'Длинные биты (4–12 мин)' }
  ];

  // Синхронизация состояний с ref'ами
  useEffect(() => { beatsRef.current = beats; }, [beats]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { streamModeRef.current = streamMode; }, [streamMode]);
  useEffect(() => { streamStatusRef.current = streamStatus; }, [streamStatus]);


  // Очистка всех таймеров
  const clearAllTimers = useCallback(() => {
    if (streamTimerRef.current) {
      clearTimeout(streamTimerRef.current);
      streamTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // --- addStreamNotification ---
  const addStreamNotification = useCallback((message: string) => {
    setStreamNotifications(prev => [...prev, message]);
    setTimeout(() => {
      setStreamNotifications(prev => prev.filter(msg => msg !== message));
    }, 5000);
  }, []);




  // --- switchToNextTrack ---
  // Объявление перенесено ниже, после loadTrackInPlayer

  // --- ref для вызова из сторонних обработчиков ---
  const switchToNextTrackRef = useRef<() => void>(() => {});
  // useEffect для switchToNextTrackRef должен быть после объявления switchToNextTrack

  // ...existing code...

  // ГЛАВНЫЙ useEffect для управления потоком (таймер)
  useEffect(() => {
    clearAllTimers();
    setStreamCountdown(0);

    if (streamMode === 'disabled' || streamStatus !== 'active' || !isPlaying) return;
    if (beats.length === 0) return;
    if (streamMode === 'full') return;

    const duration = streamMode === '30' ? 30 : 60;
    let countdown = duration;
    setStreamCountdown(countdown);

    const countInterval = setInterval(() => {
      countdown = Math.max(0, countdown - 0.1);
      setStreamCountdown(countdown);
      if (countdown <= 0.11) {
        setStreamCountdown(0);
        clearInterval(countInterval);
        if (switchToNextTrackRef.current) switchToNextTrackRef.current();
      }
    }, 100);

    countdownIntervalRef.current = countInterval;

    return () => {
      clearAllTimers();
    };
  }, [streamMode, streamStatus, isPlaying, beats.length, beats, currentIndex]);

  // --- WATCHDOG для потока ---
  useEffect(() => {
    if (streamMode === 'disabled' || streamStatus !== 'active') return;
    const watchdog = setInterval(() => {
      // Если countdown "завис" на нуле, а трек не переключился — форсируем переключение
      if (
        streamStatusRef.current === 'active' &&
        streamModeRef.current !== 'disabled' &&
        streamModeRef.current !== 'full' &&
        (streamCountdown <= 0.11 || !isPlayingRef.current)
      ) {
        if (switchToNextTrackRef.current) switchToNextTrackRef.current();
      }
      if (
        streamStatusRef.current === 'active' &&
        streamModeRef.current === 'full' &&
        !isPlayingRef.current
      ) {
        if (switchToNextTrackRef.current) switchToNextTrackRef.current();
      }
    }, 1500);
    return () => clearInterval(watchdog);
  }, [streamMode, streamStatus, streamCountdown]);

  const openInYouTube = useCallback((videoId: string) => {
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
  }, []);

  // Проверка длительности трека (отсекаем короче 1 минуты и длиннее 12 минут)
  const isValidBeatDuration = useCallback((title: string, description: string): boolean => {
    const text = `${title} ${description}`.toLowerCase();
    let foundDuration = null;

    const mmssMatch = text.match(/(\d{1,2}):(\d{2})/);
    if (mmssMatch) {
      const minutes = parseInt(mmssMatch[1]);
      const seconds = parseInt(mmssMatch[2]);
      foundDuration = minutes * 60 + seconds;
    }

    if (!foundDuration) {
      const minMatch = text.match(/(\d+)\s*min/);
      if (minMatch) foundDuration = parseInt(minMatch[1]) * 60;
    }

    if (!foundDuration) {
      const secMatch = text.match(/(\d+)\s*sec/);
      if (secMatch) foundDuration = parseInt(secMatch[1]);
    }

    if (foundDuration !== null) {
      // Только если удалось определить длительность — фильтруем строго
      return foundDuration >= 60 && foundDuration <= 720;
    }

    // Если не удалось определить длительность — не фильтруем
    return true;
  }, []);

  const getDurationParam = useCallback((filter: DurationFilter) => {
    switch (filter) {
      case 'short': return 'short';
      case 'long': return 'long';
      default: return 'medium';
    }
  }, []);

  const getDurationFilterText = useCallback((filter: DurationFilter) => {
    const option = durationOptions.find(opt => opt.value === filter);
    return option ? option.label : 'От 2 до 4 минут';
  }, []);

  const isRecentBeat = useCallback((publishedAt: string): boolean => {
    const publishDate = new Date(publishedAt);
    const fourYearsAgo = new Date();
    fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);
    return publishDate >= fourYearsAgo;
  }, []);

  // Загрузка кэша, квоты, избранного
  useEffect(() => {
    const savedCache = safeGetLocalStorage(cacheKey, handleError);
    const savedQuota = safeGetLocalStorage(quotaKey, handleError);
    const savedFavorites = safeGetLocalStorage(localKey, handleError);
    if (savedCache) {
      try {
        const cacheData: CacheData = savedCache;
        const cacheAge = Date.now() - cacheData.timestamp;
        const cacheValidFor = 2 * 60 * 60 * 1000;
        if (cacheAge < cacheValidFor) {
          setCachedBeats(cacheData.beats);
          setExtractedTags(cacheData.searchTags);
        }
      } catch (error) {
        handleError(error, false, 'Ошибка загрузки кэша');
      }
    }
    if (savedQuota) {
      try {
        const quotaData = savedQuota;
        const today = new Date().toDateString();
        if (quotaData.date === today) setQuotaUsage(quotaData.usage);
      } catch (error) {
        handleError(error, false, 'Ошибка загрузки квоты');
      }
    }
    if (savedFavorites) {
      try {
        setFavorites(savedFavorites);
      } catch (error) {
        handleError(error, false, 'Ошибка загрузки избранного');
      }
    }
  }, []);

  const extractTagsFromBeats = useCallback((beats: Beat[]): string[] => {
    const allTags = new Set<string>();
    beats.forEach(beat => {
      const text = `${beat.title} ${beat.description}`.toLowerCase();
      const words = text.match(/\b[a-zA-Z]{3,15}\b/g) || [];
      words.forEach(word => {
        const cleanWord = word.toLowerCase().trim();
        if (!excludeWords.includes(cleanWord) && !beatKeywords.includes(cleanWord) && cleanWord.length >= 3) {
          allTags.add(cleanWord);
        }
      });
    });
    return Array.from(allTags).slice(0, 20);
  }, []);

  const generateSearchQueries = useCallback((userInput: string, durationFilter: DurationFilter): string[] => {
    const baseTerms = ['type beat', 'free for profit'];
    const currentYear = new Date().getFullYear();
    const recentYears = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
    
    let durationModifiers: string[] = [];
    if (durationFilter === 'short') durationModifiers = ['snippet', 'short', 'preview'];
    else if (durationFilter === 'long') durationModifiers = ['full version', 'extended', 'complete'];
    
    if (!userInput.trim()) {
      let queries = baseTerms.map(term => `${term} ${recentYears[Math.floor(Math.random() * recentYears.length)]}`);
      if (durationModifiers.length > 0) {
        const randomModifier = durationModifiers[Math.floor(Math.random() * durationModifiers.length)];
        queries = queries.map(query => `${query} ${randomModifier}`);
      }
      return queries;
    }
    
    const input = userInput.trim();
    let queries = baseTerms.map(term => `${input} ${term} ${recentYears[Math.floor(Math.random() * recentYears.length)]}`);
    if (durationModifiers.length > 0) {
      const randomModifier = durationModifiers[Math.floor(Math.random() * durationModifiers.length)];
      queries = queries.map(query => `${query} ${randomModifier}`);
    }
    return queries;
  }, []);

  const matchesUserInput = useCallback((beat: Beat, userInput: string): boolean => {
    if (!userInput.trim()) return true;
    const searchText = `${beat.title} ${beat.description}`.toLowerCase();
    const inputWords = userInput.toLowerCase().split(' ').filter(word => word.length > 2);
    return inputWords.every(word => searchText.includes(word));
  }, []);

  const isBeatVideo = useCallback((item: Beat): boolean => {
    const searchText = `${item.title} ${item.description} ${item.channelTitle}`.toLowerCase();
    const hasBeatKeyword = beatKeywords.some(keyword => searchText.includes(keyword.toLowerCase()));
    const excludeKeywords = [
      'official music video', 'official video', 'music video',
      'live performance', 'concert', 'interview', 'reaction',
      'review', 'tutorial', 'how to', 'behind the scenes'
    ];
    const hasExcludeKeyword = excludeKeywords.some(keyword => searchText.includes(keyword.toLowerCase()));
    const hasValidDuration = isValidBeatDuration(item.title, item.description);
    return hasBeatKeyword && !hasExcludeKeyword && hasValidDuration;
  }, [isValidBeatDuration]);

  const shouldUseCachedResults = useCallback((): boolean => {
    if (cachedBeats.length === 0) return false;
    const availableBeats = cachedBeats.filter(beat => !shownBeats.has(beat.videoId) && matchesUserInput(beat, searchQuery));
    return availableBeats.length > 10;
  }, [cachedBeats, shownBeats, searchQuery, matchesUserInput]);

  const saveToCache = useCallback((beats: Beat[], tags: string[]) => {
    const cacheData: CacheData = { beats, timestamp: Date.now(), searchTags: tags };
    safeSetLocalStorage(cacheKey, cacheData, handleError);
    setCachedBeats(beats);
    setExtractedTags(tags);
  }, [handleError]);

  const updateQuotaUsage = useCallback((cost: number) => {
    const newUsage = quotaUsage + cost;
    setQuotaUsage(newUsage);
    const quotaData = { date: new Date().toDateString(), usage: newUsage };
    safeSetLocalStorage(quotaKey, quotaData, handleError);
  }, [quotaUsage, handleError]);

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };


  // ...existing code...
  // ...existing code...


  const isPlayerValid = useCallback(() => {
    if (!playerRef.current || !apiLoaded || !isPlayerReady) return false;
    try {
      return (
        typeof playerRef.current.loadVideoById === 'function' &&
        typeof playerRef.current.playVideo === 'function' &&
        typeof playerRef.current.pauseVideo === 'function' &&
        typeof playerRef.current.getCurrentTime === 'function'
      );
    } catch (error) {
      return false;
    }
  }, [isPlayerReady, apiLoaded]);

  const loadTrackInPlayer = useCallback((beat: Beat) => {
    if (!beat?.videoId) return;
    if (!isPlayerValid()) {
      setPendingVideoLoad(beat);
      return;
    }
    try {
      playerRef.current.loadVideoById({ videoId: beat.videoId, startSeconds: 0 });
      setShownBeats(prev => new Set(prev).add(beat.videoId));
      setPendingVideoLoad(null);
    } catch (error) {
      console.error('Ошибка при загрузке видео:', error);
    }
  }, [isPlayerValid]);

  useEffect(() => {
    if (isPlayerValid() && pendingVideoLoad) {
      loadTrackInPlayer(pendingVideoLoad);
    }
  }, [isPlayerValid, pendingVideoLoad, loadTrackInPlayer]);

  // --- Надёжное переключение трека ---
  // Универсальная функция переключения трека потока
  const switchToNextTrack = React.useCallback(() => {
    clearAllTimers();
    if (beats.length === 0) return;
    let nextIndex = (currentIndex + 1) % beats.length;
    setCurrentIndex(nextIndex);
    loadTrackInPlayer(beats[nextIndex]);
    setStreamCountdown(0);
    // После переключения — если поток активен, запустить новый цикл
    if (streamMode !== 'disabled' && streamStatus === 'active') {
      setTimeout(() => {
        setIsPlaying(true); // попытка запустить плеер, если вдруг не стартовал
      }, 200);
    }
  }, [beats, currentIndex, loadTrackInPlayer, streamMode, streamStatus, clearAllTimers]);

  // Обновляем ref для универсального вызова
  useEffect(() => {
    switchToNextTrackRef.current = switchToNextTrack;
  }, [switchToNextTrack]);

  const getStreamStatusText = () => {
    switch (streamStatus) {
      case 'active': return streamCountdown > 0 ? `Следующий через: ${Math.ceil(streamCountdown)}с` : 'Поток активен';
      case 'paused': return 'Поток приостановлен';
      case 'disabled': return 'Поток отключен';
      default: return 'Поток отключен';
    }
  };

  // ...удалено дублирующее объявление addStreamNotification...

  const fetchBeats = async (useCache: boolean = true) => {
    if (!API_KEY) {
      handleError('API ключ не найден', true, 'API ключ не найден');
      return;
    }
    if (quotaUsage >= 9800) {
      showError('Дневная квота почти исчерпана. Используем кэшированные результаты.');
      useCache = true;
    }
    if (useCache && shouldUseCachedResults()) {
      const availableBeats = cachedBeats.filter(beat => !shownBeats.has(beat.videoId) && matchesUserInput(beat, searchQuery));
      const shuffledBeats = shuffleArray(availableBeats.slice(0, 50));
      setBeats(shuffledBeats);
      setCurrentIndex(0);
      if (shuffledBeats.length > 0) loadTrackInPlayer(shuffledBeats[0]);
      return;
    }
    setIsLoading(true);
    try {
      const queries = generateSearchQueries(searchQuery, durationFilter);
      const allBeats: Beat[] = [];
      let apiError: any = null;
      for (const query of queries) {
        try {
          const { data } = await axios.get('https://www.googleapis.com/youtube/v3/search', {
            params: {
              part: 'snippet',
              type: 'video',
              q: query,
              maxResults: 25,
              videoEmbeddable: 'true',
              videoDuration: getDurationParam(durationFilter),
              relevanceLanguage: 'en',
              order: 'relevance',
              key: API_KEY,
            },
          });
          updateQuotaUsage(100);
          const items: Beat[] = data.items.map((item: any) => ({
            videoId: item.id.videoId,
            title: item.snippet.title,
            description: item.snippet.description,
            channelTitle: item.snippet.channelTitle,
            publishedAt: item.snippet.publishedAt,
          }));
          allBeats.push(...items);
          if (queries.indexOf(query) < queries.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error: any) {
          apiError = error;
          // Если ошибка связана с ключом или доступом, не продолжаем дальше
          if (error.response?.status === 403) {
            if (error.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded') {
              showError('❌ ДНЕВНОЙ ЛИМИТ ИСЧЕРПАН! Используем кэшированные результаты.');
            } else {
              showError('Ошибка доступа к YouTube API. Проверьте правильность и права API-ключа.');
            }
            break;
          } else if (error.response?.status === 400) {
            showError('Некорректный API-ключ или параметры запроса.');
            break;
          } else {
            handleError(error, true, `Ошибка для запроса "${query}"`);
          }
        }
      }
      // Если был API-ошибка, не показываем "биты не найдены"
      if (apiError) {
        setIsLoading(false);
        return;
      }
      const recentBeatVideos = allBeats.filter(item => {
        const isBeat = isBeatVideo(item);
        const matchesInput = matchesUserInput(item, searchQuery);
        const notShown = !shownBeats.has(item.videoId);
        const isRecent = isRecentBeat(item.publishedAt);
        return isBeat && matchesInput && notShown && isRecent;
      });
      let finalBeats = recentBeatVideos;
      if (finalBeats.length === 0) {
        finalBeats = allBeats.filter(item => isBeatVideo(item) && !shownBeats.has(item.videoId) && matchesUserInput(item, searchQuery));
      }
      const uniqueBeats = Array.from(new Map(finalBeats.map(beat => [beat.videoId, beat])).values());
      if (uniqueBeats.length === 0) {
        showError('По вашему запросу биты не найдены. Попробуйте другие ключевые слова или измените фильтр длительности.');
        return;
      }
      const newTags = extractTagsFromBeats(uniqueBeats);
      const combinedBeats = [...cachedBeats, ...uniqueBeats];
      const allUniqueBeats = Array.from(new Map(combinedBeats.map(beat => [beat.videoId, beat])).values());
      saveToCache(allUniqueBeats, [...extractedTags, ...newTags]);
      const shuffledBeats = shuffleArray(uniqueBeats);
      setBeats(shuffledBeats);
      setCurrentIndex(0);
      if (shuffledBeats.length > 0) loadTrackInPlayer(shuffledBeats[0]);
    } catch (error: any) {
      handleError(error, true, 'Ошибка при получении битов');
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlayPause = useCallback(() => {
    if (!isPlayerValid()) return;
    setUserInteracted(true);
    try {
      if (isPlaying) {
        playerRef.current.pauseVideo();
        setIsPlaying(false);
        setStreamStatus('paused'); // поток на паузу
      } else {
        playerRef.current.playVideo();
        setIsPlaying(true);
        if (streamMode !== 'disabled') setStreamStatus('active'); // поток снова активен
      }
    } catch (error) {
      console.error('Ошибка при воспроизведении/паузе:', error);
    }
  }, [isPlaying, isPlayerValid, streamMode]);

  const playNextBeat = useCallback(() => {
    if (beats.length === 0) return;
    if (beats.length < 3) {
      fetchBeats(false);
      return;
    }
    const nextIndex = (currentIndex + 1) % beats.length;
    setCurrentIndex(nextIndex);
    loadTrackInPlayer(beats[nextIndex]);
    if (streamMode !== 'disabled') setStreamStatus('active'); // сброс потока
  }, [beats, currentIndex, loadTrackInPlayer, streamMode]);

  const playPreviousBeat = useCallback(() => {
    if (beats.length === 0) return;
    const prevIndex = currentIndex === 0 ? beats.length - 1 : currentIndex - 1;
    setCurrentIndex(prevIndex);
    loadTrackInPlayer(beats[prevIndex]);
    if (streamMode !== 'disabled') setStreamStatus('active'); // сброс потока
  }, [beats, currentIndex, loadTrackInPlayer, streamMode]);

  const playFromFavorites = useCallback((beat: Beat) => {
    setBeats([beat]);
    setCurrentIndex(0);
    loadTrackInPlayer(beat);
    setShowFavoritesModal(false);
    if (streamMode !== 'disabled') setStreamStatus('active'); // сброс потока
  }, [loadTrackInPlayer, streamMode]);

  const initializePlayer = useCallback(() => {
    if (playerInitialized || !apiLoaded) return;
    const element = document.getElementById('yt-player');
    if (!element) return;

    try {
      playerRef.current = new window.YT.Player('yt-player', {
        height: '315',
        width: '100%',
        videoId: 'M7lc1UVf-VE',
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          showinfo: 0,
          modestbranding: 1,
          fs: 1,
          cc_load_policy: 0,
          iv_load_policy: 3,
          playsinline: 1,
          enablejsapi: 1
        },
        events: {
          onReady: (event: any) => {
            setIsPlayerReady(true);
          },
          onStateChange: (event: any) => {
            if (event.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
            } else if (event.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (event.data === window.YT.PlayerState.ENDED) {
              setIsPlaying(false);
              // Только если поток активен, вызываем актуальную функцию через ref
              if (streamStatusRef.current === 'active') {
                if (switchToNextTrackRef.current) switchToNextTrackRef.current();
              }
            }
          },
          onError: (event: any) => {
            console.error('Ошибка YouTube Player:', event.data);
            if (streamStatusRef.current === 'active') {
              if (switchToNextTrackRef.current) switchToNextTrackRef.current();
            }
          }
        },
      });

      setPlayerInitialized(true);
      readyCheckRef.current = setTimeout(() => {
        if (!isPlayerReady && playerRef.current) {
          try {
            if (typeof playerRef.current.getPlayerState === 'function') {
              setIsPlayerReady(true);
            }
          } catch (error) {
            console.log('Плеер все еще не готов');
          }
        }
      }, 5000);
    } catch (error) {
      console.error('Ошибка при создании плеера:', error);
      setPlayerInitialized(false);
    }
  }, [apiLoaded, playerInitialized, isPlayerReady]);

  useEffect(() => {
    if (beats.length > 0 && apiLoaded && !playerInitialized) {
      setTimeout(initializePlayer, 1000);
    }
  }, [beats.length, apiLoaded, playerInitialized, initializePlayer]);

  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setApiLoaded(true);
      return;
    }
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    window.onYouTubeIframeAPIReady = () => setApiLoaded(true);
    document.body.appendChild(tag);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (readyCheckRef.current) clearTimeout(readyCheckRef.current);
      clearAllTimers();
    };
  }, [clearAllTimers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBeats(false);
  };

  const handleStreamSettings = () => {
    setShowStreamModal(true);
  };

  const applyStreamSettings = (mode: StreamMode) => {
    setShowStreamModal(false);
    setStreamMode(mode);
    if (mode === 'disabled') {
      setStreamStatus('disabled');
    } else {
      setStreamStatus('active');
    }
  };

  const handleDurationFilterChange = (filter: DurationFilter) => {
    setDurationFilter(filter);
    setShowDurationModal(false);
  };

  const clearCache = () => {
    localStorage.removeItem(cacheKey);
    setCachedBeats([]);
    setExtractedTags([]);
  };

  const forceInitPlayer = () => {
    setPlayerInitialized(false);
    setIsPlayerReady(false);
    playerRef.current = null;
    setTimeout(() => {
      if (beats.length > 0) {
        initializePlayer();
      }
    }, 1000);
  };

  const currentBeat = beats[currentIndex];
  const quotaPercentage = Math.round((quotaUsage / 10000) * 100);
  const recentFavorites = favorites.slice(0, 3);

  const getStreamModeText = (mode: StreamMode) => {
    switch (mode) {
      case 'disabled': return 'Отключен';
      case '30': return '30 секунд';
      case '60': return '60 секунд';
      case 'full': return 'Полностью';
      default: return 'Отключен';
    }
  };

  // Управление классом body для скрытия кота при открытых модалках
  useEffect(() => {
    const modalOpen = showStats || showStreamModal || showDurationModal || showFavoritesModal;
    if (modalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showStats, showStreamModal, showDurationModal, showFavoritesModal]);


  // Добавить обратно функции, если они были случайно удалены
  const addToFavorites = useCallback((beat: Beat) => {
    const beatWithTimestamp = { ...beat, addedAt: Date.now() };
    const updatedFavorites = [beatWithTimestamp, ...favorites.filter(f => f.videoId !== beat.videoId)];
    setFavorites(updatedFavorites);
    safeSetLocalStorage(localKey, updatedFavorites, handleError);
  }, [favorites, handleError]);

  const removeFromFavorites = useCallback((videoId: string) => {
    const updatedFavorites = favorites.filter(f => f.videoId !== videoId);
    setFavorites(updatedFavorites);
    safeSetLocalStorage(localKey, updatedFavorites, handleError);
  }, [favorites, handleError]);

  // (Удалён дублирующий useEffect для switchToNextTrackRef)

  // Маятниковая анимация кота
  useEffect(() => {
    function animateCat() {
      setCatAnimPhase('left');
      catAnimTimeout.current = setTimeout(() => {
        setCatAnimPhase('right');
        catAnimTimeout.current = setTimeout(() => {
          setCatAnimPhase('center');
          catAnimTimeout.current = setTimeout(() => {
            setCatAnimPhase('idle');
          }, 600);
        }, 600);
      }, 600);
    }
    catAnimInterval.current = setInterval(animateCat, 10000);
    return () => {
      if (catAnimTimeout.current) clearTimeout(catAnimTimeout.current);
      if (catAnimInterval.current) clearInterval(catAnimInterval.current);
    };
  }, []);

 
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setTimeout(() => setRevealed(true), 300);
  }, []);

 
  const handleCatClick = () => {
    setShowEasterToast(true);
    setTimeout(() => setShowEasterToast(false), 3500);
  };

  return (
    <div className="app-container">
      {/* SPLASH MASTER */}
      {showSplash && (
        <div className="splash-overlay">
          <div className={`splash-scene${splashLeaving ? ' splash-leave' : ' splash-enter'}`}>
            {/* Step indicators */}
            <div className="splash-steps">
              {splashScenes.map((_, idx) => (
                <div key={idx} className={`splash-step-dot${splashStep === idx ? ' active' : ''}`}></div>
              ))}
            </div>
            {/* Title: жирный только для первых двух сцен, далее обычный */}
            <div className="splash-title">
              {splashStep <= 1 ? (
                splashScenes[splashStep].title
              ) : (
                <span className="splash-title-secondary">{splashScenes[splashStep].title}</span>
              )}
            </div>
            {/* Subtitle: всегда обычный текст */}
            {splashScenes[splashStep].subtitle && (
              <div className="splash-subtitle">{splashScenes[splashStep].subtitle}</div>
            )}
            {/* Input step */}
            {splashScenes[splashStep].input && (
              <>
                <input
                  className="splash-input"
                  type="text"
                  placeholder="Введите API-ключ"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  autoFocus
                />
                <button
                  className="splash-btn"
                  disabled={apiKeyInput.trim().length < 35}
                  onClick={handleSaveApiKey}
                >
                  {splashScenes[splashStep].button}
                </button>
                <div className="splash-hint">{splashScenes[splashStep].hint}</div>
              </>
            )}
            {/* Next button for non-input steps */}
            {!splashScenes[splashStep].input && (
              <button className="splash-btn" onClick={nextSplash}>
                {splashScenes[splashStep].button}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ...existing code... */}
      {/* Toast для критических ошибок */}
      {errorMessage && <Toast message={errorMessage} onClose={() => showError('')} />}
      {/* Фон сайта */}
      <div 
        className="background-image"
        style={{
          backgroundImage: `url(${backgroundImage})`
        }}
      ></div>
      {/* Diffuse animated background */}
      <div className="diffuse-bg" />
      
      {/* Маскот сайта */}
      <img
        className={`cat-mascot${catAnimPhase === 'left' ? ' cat-left' : catAnimPhase === 'right' ? ' cat-right' : catAnimPhase === 'center' ? ' cat-center' : ''}`}
        src={catImage}
        alt="Маскот сайта"
        style={{ cursor: 'pointer', pointerEvents: 'auto' }}
        onClick={handleCatClick}
        title="Кликни!"
        tabIndex={0}
        role="button"
        aria-label="Пасхалка: кликни кота"
        draggable={false}
      />

      <div className="app-wrapper">
        <header className="app-header">
          <h1 className="app-title">🎛️ BeatParser</h1>
        </header>

        {/* Уведомления потока */}
        {streamNotifications.map((notification, index) => (
          <div key={index} className="stream-notification">
            <span className="notification-icon">ℹ️</span>
            <span className="notification-text">{notification}</span>
          </div>
        ))}

        {/* ГЛАВНЫЙ LAYOUT - ТРИ КОЛОНКИ */}
        <div className={`main-layout${revealed ? ' scroll-reveal' : ''}`}> 
          {/* ЛЕВАЯ КОЛОНКА - поиск + плеер */}
          <div className="left-column">
            {/* ВЕРХНИЙ БЛОК - поиск и фильтры */}
            <div className="search-block">
              <div className="search-left">
                <form onSubmit={handleSearch} className="search-form">
                  <div style={{ position: 'relative' }}>
                    <input
                      className="search-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      style={{ background: 'transparent' }}
                    />
                    {!searchQuery && (
                      <span
                        className="animated-placeholder-slider"
                        style={{
                          position: 'absolute',
                          left: 16,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          pointerEvents: 'none',
                          opacity: 0.7,
                          fontSize: '1em',
                          fontWeight: 300,
                          color: '#fff',
                          fontFamily: 'Montserrat, Arial, sans-serif',
                          display: 'flex',
                          alignItems: 'center',
                          height: 24,
                          lineHeight: '24px',
                        }}
                      >
                        Введите&nbsp;
                        <span
                          className="slider-words-wrapper"
                          style={{
                            display: 'inline-block',
                            height: 24,
                            overflow: 'hidden',
                            verticalAlign: 'middle',
                            position: 'relative',
                            width: 'auto',
                            minWidth: 90,
                          }}
                        >
                          <span
                            className="slider-words-inner"
                            style={{
                              display: 'block',
                              transition: 'transform 0.35s cubic-bezier(.4,1.6,.6,1)',
                              transform: isSliding ? 'translateY(-24px)' : 'translateY(0)',
                            }}
                          >
                            <span
                              className="slider-word"
                              style={{
                                display: 'block',
                                color: '#ff2222',
                                fontWeight: 300,
                                fontFamily: 'Montserrat, Arial, sans-serif',
                                fontSize: '1em',
                                height: 24,
                                lineHeight: '24px',
                                letterSpacing: 0.5,
                                fontVariant: 'none',
                              }}
                            >
                              {carouselWords[carouselIndex]}
                            </span>
                            <span
                              className="slider-word"
                              style={{
                                display: 'block',
                                color: '#ff2222',
                                fontWeight: 300,
                                fontFamily: 'Montserrat, Arial, sans-serif',
                                fontSize: '1em',
                                height: 24,
                                lineHeight: '24px',
                                letterSpacing: 0.5,
                                fontVariant: 'none',
                              }}
                            >
                              {carouselWords[(carouselIndex + 1) % carouselWords.length]}
                            </span>
                          </span>
                        </span>
                      </span>
                    )}
                  </div>
                </form>
                <div className="filter-buttons">
                  <StreamButton
                    streamMode={streamMode}
                    streamStatus={streamStatus}
                    streamCountdown={streamCountdown}
                    onClick={handleStreamSettings}
                    getStreamModeText={getStreamModeText}
                  />
                  <button
                    onClick={() => setShowDurationModal(true)}
                    className="control-button duration-button"
                    title="Выбрать длительность треков"
                  >
                    ⏱️ {getDurationFilterText(durationFilter)}
                  </button>
                </div>
              </div>
            </div>

            {/* БЛОК "СЕЙЧАС ИГРАЕТ" */}
            <div className="now-playing">
              <span className="now-label">сейчас играет:</span>
              <span className="now-title">{currentBeat?.title || '[название бита]'}</span>
            </div>

            {/* КОНТРОЛЫ ПЛЕЕРА */}
            <div className="player-controls">
              <button
                onClick={playPreviousBeat}
                disabled={!isPlayerValid() || beats.length <= 1}
                className="control-btn prev-btn"
                title="Перейти к предыдущему треку"
              >
                {/* Красная стрелка влево */}
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff2222" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <button
                onClick={togglePlayPause}
                disabled={!isPlayerValid()}
                className="control-btn play-btn"
                title={isPlaying ? "Поставить на паузу" : "Начать воспроизведение"}
              >
                {/* Красный play/pause */}
                {isPlaying ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff2222" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff2222" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="6,4 20,12 6,20 6,4"/></svg>
                )}
              </button>
              <button
                onClick={playNextBeat}
                disabled={!isPlayerValid() || beats.length <= 1}
                className="control-btn next-btn"
                title="Перейти к следующему треку"
              >
                {/* Красная стрелка вправо */}
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff2222" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18"/></svg>
              </button>
              <FavoriteButton
                isFavorite={!!currentBeat && favorites.some(f => f.videoId === currentBeat.videoId)}
                onClick={() => addToFavorites(currentBeat)}
              />
            </div>

            {/* МЕДИАПЛЕЕР */}
            <div className="player-container">
              <div ref={playerContainerRef} className="player-wrapper">
                <div id="yt-player" />
              </div>
            </div>
          </div>

          {/* СРЕДНЯЯ КОЛОНКА - кнопка "поиск трека" */}
          <div className="middle-column">
            <button
              className="search-track-button"
              disabled={isLoading || !apiLoaded}
              onClick={handleSearch}
              title="Найти новые биты"
            >
              {isLoading ? 'Поиск...' : '↗ поиск трека'}
            </button>
          </div>

          {/* ПРАВАЯ КОЛОНКА - сайдбар */}
          <div className="right-column">
            <div 
              className="favorites-block"
              onClick={() => setShowFavoritesModal(true)}
              style={{ cursor: 'pointer' }}
              title="Открыть полный список избранного"
            >
              <h3 className="favorites-title">избранное</h3>
              {recentFavorites.length === 0 ? (
                <p className="favorites-empty">Нет избранных треков</p>
              ) : (
                <div className="favorites-list">
                  {recentFavorites.map((beat) => (
                    <div
                      key={beat.videoId}
                      className={`favorite-item ${hoveredFavorite === beat.videoId ? 'hovered' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openInYouTube(beat.videoId);
                      }}
                      onMouseEnter={() => setHoveredFavorite(beat.videoId)}
                      onMouseLeave={() => setHoveredFavorite(null)}
                      title="Открыть на YouTube"
                    >
                      <div className={`favorite-item-title ${hoveredFavorite === beat.videoId ? 'clickable' : ''}`}>
                        {hoveredFavorite === beat.videoId ? '🔗 ' : ''}{beat.title}
                      </div>
                      <div className="favorite-item-channel">{beat.channelTitle}</div>
                    </div>
                  ))}
                  {favorites.length > 3 && (
                    <div className="favorites-more">
                      и еще {favorites.length - 3} треков...
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowStats(true)}
              className="stats-button"
              title="Статистика"
            >
              статистика
            </button>
          </div>
        </div>

        {/* Модалки */}
        {showStreamModal && (
          <div className="modal-overlay">
            <div className="modal-content stream-modal">
              <div className="modal-header">
                <h3 className="modal-title">⚙️ Настройки потока</h3>
                <button
                  onClick={() => setShowStreamModal(false)}
                  className="modal-close"
                  title="Закрыть окно настроек"
                >
                  ×
                </button>
              </div>
              <p>Выберите режим воспроизведения:</p>
              <div className="stream-options">
                <button
                  onClick={() => applyStreamSettings('disabled')}
                  className={`stream-option ${streamMode === 'disabled' ? 'selected' : ''}`}
                  title="Воспроизводить только один трек за раз"
                >
                  <div className="stream-option-title">🚫 Отключить поток</div>
                  <div className="stream-option-description">Один трек за раз, без автопереключения</div>
                </button>
                <button
                  onClick={() => applyStreamSettings('30')}
                  className={`stream-option ${streamMode === '30' ? 'selected' : ''}`}
                  title="Автоматически переключать на следующий трек через 30 секунд"
                >
                  <div className="stream-option-title">⏱️ 30 секунд на трек</div>
                  <div className="stream-option-description">Быстрое прослушивание битов</div>
                </button>
                <button
                  onClick={() => applyStreamSettings('60')}
                  className={`stream-option ${streamMode === '60' ? 'selected' : ''}`}
                  title="Автоматически переключать на следующий трек через 60 секунд"
                >
                  <div className="stream-option-title">⏰ 60 секунд на трек</div>
                  <div className="stream-option-description">Детальное прослушивание</div>
                </button>
                <button
                  onClick={() => applyStreamSettings('full')}
                  className={`stream-option ${streamMode === 'full' ? 'selected' : ''}`}
                  title="Проигрывать каждый трек полностью до конца"
                >
                  <div className="stream-option-title">🎵 Полное воспроизведение</div>
                  <div className="stream-option-description">Проигрывать треки до конца</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {showDurationModal && (
          <div className="modal-overlay">
            <div className="modal-content duration-modal">
              <div className="modal-header">
                <h3 className="modal-title">⏱️ Длительность треков</h3>
                <button
                  onClick={() => setShowDurationModal(false)}
                  className="modal-close"
                  title="Закрыть окно выбора длительности"
                >
                  ×
                </button>
              </div>
              <p>Выберите длительность треков:</p>
              <div className="duration-options">
                {durationOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleDurationFilterChange(option.value as DurationFilter)}
                    className={`duration-option ${durationFilter === option.value ? 'selected' : ''}`}
                  >
                    <div className="duration-option-title">{option.label}</div>
                    <div className="duration-option-description">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showFavoritesModal && (
          <div className="modal-overlay">
            <div className="modal-content favorites-modal">
              <div className="modal-header">
                <h3 className="modal-title">⭐ Все избранные треки</h3>
                <button
                  onClick={() => setShowFavoritesModal(false)}
                  className="modal-close"
                  title="Закрыть список избранного"
                >
                  ×
                </button>
              </div>
              <div className="favorites-modal-content">
                {favorites.length === 0 ? (
                  <p className="favorites-empty">Нет избранных треков</p>
                ) : (
                  <div className="favorites-modal-list">
                    {favorites.map((beat) => (
                      <div key={beat.videoId} className="favorites-modal-item">
                        <div
                          className="favorites-modal-info"
                          onClick={() => openInYouTube(beat.videoId)}
                          title="Открыть на YouTube"
                        >
                          <div className="favorites-modal-title">🔗 {beat.title}</div>
                          <div className="favorites-modal-channel">{beat.channelTitle}</div>
                        </div>
                        <div className="favorites-modal-actions">
                          <button
                            onClick={() => playFromFavorites(beat)}
                            className="favorites-action-button play-action-button"
                            title="Воспроизвести в плеере"
                          >
                            ▶️ Играть
                          </button>
                          <button
                            onClick={() => openInYouTube(beat.videoId)}
                            className="favorites-action-button youtube-action-button"
                            title="Открыть на YouTube"
                          >
                            🔗 YouTube
                          </button>
                          <button
                            onClick={() => removeFromFavorites(beat.videoId)}
                            className="favorites-action-button delete-action-button"
                            title="Удалить из избранного"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {showStats && (
          <div className="modal-overlay">
            <div className="modal-content stats-modal">
              <div className="modal-header">
                <h3 className="modal-title">📊 Статистика</h3>
                <button
                  onClick={() => setShowStats(false)}
                  className="modal-close"
                  title="Закрыть статистику"
                >
                  ×
                </button>
              </div>
              <div className="stats-content">
                <div className="quota-info">
                  <div className="quota-header">
                    <span className="quota-label">Использование API квоты:</span>
                    <span className="quota-value">{quotaUsage} / 10,000 ({quotaPercentage}%)</span>
                  </div>
                  <div className="quota-bar">
                    <div
                      className={`quota-progress ${
                        quotaPercentage < 50 ? 'low' : quotaPercentage < 80 ? 'medium' : 'high'
                      }`}
                      style={{ width: `${Math.min(quotaPercentage, 100)}%` }}
                    />
                  </div>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Найдено битов:</span>
                  <span className="stats-value">{beats.length}</span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Избранных треков:</span>
                  <span className="stats-value">{favorites.length}</span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Кэшировано битов:</span>
                  <span className="stats-value">{cachedBeats.length}</span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Текущий запрос:</span>
                  <span className="stats-value">{searchQuery || 'Случайный'}</span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Режим потока:</span>
                  <span className="stats-value">{getStreamModeText(streamMode)}</span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Статус потока:</span>
                  <span className={`stats-value ${streamStatus === 'active' ? 'success' : 'muted'}`}>
                    {getStreamStatusText()}
                  </span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Прогресс потока:</span>
                  <span className="stats-value">
                    {streamStatus === 'active' && streamMode !== 'disabled' && streamMode !== 'full'
                      ? `${Math.round(
                          ((streamMode === '30' ? 30 : 60) - streamCountdown) /
                            (streamMode === '30' ? 30 : 60) *
                            100
                        )}%`
                      : 'Неактивен'}
                  </span>
                </div>
                <div className="stats-row">
                  <span className="stats-label">Статус воспроизведения:</span>
                  <span className={`stats-value ${isPlaying ? 'success' : 'muted'}`}>
                    {isPlaying ? '🔴 Играет' : '⚫ Пауза'}
                  </span>
                </div>
                <div className="stats-actions">
                  <button
                    onClick={() => {
                      clearCache();
                      setShowStats(false);
                    }}
                    className="stats-action-button clear-cache-button"
                    title="Очистить кэшированные данные"
                  >
                    🧹 Очистить кэш
                  </button>
                  <button
                    onClick={() => {
                      forceInitPlayer();
                      setShowStats(false);
                    }}
                    disabled={!apiLoaded}
                    className="stats-action-button reinit-player-button"
                    title="Перезапустить YouTube плеер при проблемах"
                  >
                    🔄 Переинициализировать плеер
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Пасхалка: тост */}
        {showEasterToast && <EasterCatToast onClose={() => setShowEasterToast(false)} />}
      </div>
    </div>
  );
};

export default App;
