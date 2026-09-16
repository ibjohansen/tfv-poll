'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';

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
      className="home-hero-carousel relative flex min-h-[clamp(26rem,60vh,46rem)] w-full items-end overflow-hidden bg-primary focus-visible:outline-3 focus-visible:outline-offset-[-3px] focus-visible:outline-white"
      aria-roledescription="karusell"
      aria-label="Bilder fra Turufjell"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setHasFocusWithin(true)}
      onBlurCapture={handleBlur}
    >
      <div className="absolute inset-0" aria-live="off">
        {images.map((image, index) => {
          const isActive = index === activeIndex;
          return (
            <div
              key={image.id}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${isActive ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
              aria-hidden={!isActive}
            >
              <Image
                src={image.src}
                alt={isActive ? (image.photographer ? `Turufjell. Foto: ${image.photographer}` : 'Utsikt over fjellandskapet på Turufjell') : ''}
                fill
                sizes="100vw"
                preload={index === 0}
                className="object-cover object-center"
              />
            </div>
          );
        })}
      </div>

      <div className="absolute inset-0 bg-linear-to-t from-[#493F39]/85 via-[#493F39]/15 to-transparent" aria-hidden="true" />

      {imageCount > 1 && (
        <>
          <button className="home-carousel-arrow home-carousel-arrow-left" type="button" onClick={showPrevious} aria-label="Forrige bilde" title="Forrige bilde">
            <Chevron direction="left" />
          </button>
          <button className="home-carousel-arrow home-carousel-arrow-right" type="button" onClick={showNext} aria-label="Neste bilde" title="Neste bilde">
            <Chevron direction="right" />
          </button>
          <div className="home-carousel-controls" role="group" aria-label="Velg bilde">
            <button
              className="home-carousel-pause"
              type="button"
              onClick={() => setIsPaused((current) => !current)}
              aria-label={isPaused ? 'Start automatisk bildebytte' : 'Pause automatisk bildebytte'}
              title={isPaused ? 'Start automatisk bildebytte' : 'Pause automatisk bildebytte'}
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
                  aria-label={`Vis bilde ${index + 1} av ${imageCount}`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                  title={`Bilde ${index + 1}`}
                />
              ))}
            </span>
          </div>
        </>
      )}

      <div className="relative mx-auto w-full max-w-7xl px-5 pt-12 pb-20 text-white sm:px-8 sm:pt-16 sm:pb-20 lg:px-12 lg:pt-20 lg:pb-24">
        <p className="text-xs font-semibold tracking-[0.2em] text-white/70 uppercase">Turufjell Vel</p>
        <h1 id="home-title" className="mt-4 max-w-3xl text-4xl leading-[1.04] font-light tracking-[-0.035em] sm:text-6xl lg:text-7xl">Fellesskap på fjellet</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">Vi samordner og ivaretar medlemmenes interesser i og omkring Turufjell hytteområde.</p>
      </div>

      {activeImage.photographer && <p className="home-carousel-credit">Foto: {activeImage.photographer}</p>}
      <p className="visually-hidden">Bilde {activeIndex + 1} av {imageCount}</p>
    </section>
  );
}
