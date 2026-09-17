'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/components/LocaleProvider';

const AUTOPLAY_DELAY_MS = 4000;

function Chevron({ direction }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-none stroke-current stroke-2">
      <path d={direction === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
    </svg>
  );
}

function PauseIcon({ paused }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 fill-current">
      {paused ? <path d="m8 5 11 7-11 7V5Z" /> : <path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />}
    </svg>
  );
}

export default function HomeHeroCarousel({ images }) {
  const { t } = useI18n('public.carousel');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const imageCount = images.length;

  const showPrevious = useCallback(() => {
    setActiveIndex((current) => (current - 1 + imageCount) % imageCount);
  }, [imageCount]);

  const showNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % imageCount);
  }, [imageCount]);

  useEffect(() => {
    if (imageCount < 2 || isHovered || hasFocusWithin || isPaused) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotion.matches || document.hidden) return undefined;

    const timer = window.setTimeout(showNext, AUTOPLAY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, hasFocusWithin, imageCount, isHovered, isPaused, showNext]);

  function handleKeyDown(event) {
    if (imageCount < 2) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      showPrevious();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      showNext();
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(imageCount - 1);
    }
  }

  function handleBlur(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setHasFocusWithin(false);
  }

  const activeImage = images[activeIndex];

  return (
    <section
      className="home-hero-carousel relative flex min-h-[clamp(26rem,60vh,46rem)] w-full items-end overflow-hidden focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-white"
      aria-roledescription={t('role')}
      aria-label={t('label')}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setHasFocusWithin(true)}
      onBlurCapture={handleBlur}
    >
      <div className="absolute inset-0" aria-live="off">
        <div key={activeImage.id} className="absolute inset-0">
          <Image
            src={activeImage.src}
            alt={activeImage.photographer ? t('imageAlt', {name: activeImage.photographer}) : t('landscapeAlt')}
            fill
            sizes="100vw"
            preload={activeIndex === 0}
            className="object-cover object-center"
          />
        </div>
      </div>

      <div className="absolute inset-0 bg-linear-to-t from-[#493F39]/85 via-[#493F39]/15 to-transparent" aria-hidden="true" />

      {imageCount > 1 && (
        <>
          <button className="home-carousel-arrow home-carousel-arrow-left" type="button" onClick={showPrevious} aria-label={t('previous')} title={t('previous')}>
            <Chevron direction="left" />
          </button>
          <button className="home-carousel-arrow home-carousel-arrow-right" type="button" onClick={showNext} aria-label={t('next')} title={t('next')}>
            <Chevron direction="right" />
          </button>
          <div className="home-carousel-controls" role="group" aria-label={t('choose')}>
            <button
              className="home-carousel-pause"
              type="button"
              onClick={() => setIsPaused((current) => !current)}
              aria-label={isPaused ? t('play') : t('pause')}
              title={isPaused ? t('play') : t('pause')}
            >
              <PauseIcon paused={isPaused} />
            </button>
            <span className="home-carousel-dots">
              {images.map((image, index) => (
                <button
                  key={image.id}
                  className="home-carousel-dot"
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  aria-label={t('image', {current: index + 1, total: imageCount})}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  title={t('imageTitle', {current: index + 1})}
                />
              ))}
            </span>
          </div>
        </>
      )}

      <div className="relative mx-auto w-full max-w-7xl px-5 pt-12 pb-20 text-white sm:px-8 sm:pt-16 sm:pb-20 lg:px-12 lg:pt-20 lg:pb-24">
        <p className="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">{t('eyebrow')}</p>
        <h1 id="home-title" className="mt-4 max-w-3xl text-4xl leading-[1.04] font-light tracking-[-0.035em] sm:text-6xl lg:text-7xl">{t('title')}</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">{t('introduction')}</p>
      </div>

      {activeImage.photographer && <p className="home-carousel-credit">{t('photographer', {name: activeImage.photographer})}</p>}
      <p className="visually-hidden">{t('image', {current: activeIndex + 1, total: imageCount})}</p>
    </section>
  );
}
