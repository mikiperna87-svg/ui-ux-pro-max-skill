/* =============================================================
   Scene a scroll costruite da foto ad alta risoluzione.
   Il canvas muove la "camera" in tempo reale sulla foto originale:
   nitidezza piena su ogni schermo e scorrimento fluido a 60fps.

   Ogni scena ha una o più inquadrature (parts) in sequenza, con
   dissolvenza tra l'una e l'altra. Per ogni inquadratura:
     from / to : [zoom, centroX, centroY, luminosità] a inizio e fine
                 zoom 1 = foto che copre lo schermo; centro 0..1
     portraitX : [inizio, fine] centro orizzontale su schermi verticali

   Se in frames/manifest.js esiste una sequenza video con lo stesso id
   (tools/extract-frames.sh), il sito usa i fotogrammi del video.
   ============================================================= */
window.PHOTO_SCENES = {
  // 1. Hero: lento push-in sul chicco tostato in primo piano
  //    (foto sorgente 1170px ingrandita 2x: zoom contenuto per restare nitida)
  scene1: [
    { src: 'img/scenes/scene1-chicchi.webp', from: [1.0, 0.5, 0.5, 0.82], to: [1.14, 0.5, 0.42, 1], portraitX: [0.48, 0.5] },
  ],
  // 2. Torrefazione: carrellata laterale dentro la tostatrice
  scene2: [
    { src: 'img/scenes/scene2-tostatura.webp', from: [1.15, 0.3, 0.5, 0.85], to: [1.4, 0.62, 0.56, 1], portraitX: [0.3, 0.6] },
  ],
  // 3. Storia: dalla raccolta delle bacche alla crema in tazzina
  scene3: [
    { src: 'img/scenes/scene3a-raccolta.webp', from: [1.0, 0.5, 0.45, 0.9], to: [1.14, 0.56, 0.55, 1], portraitX: [0.5, 0.55] },
    { src: 'img/scenes/scene3b-crema.webp', from: [1.04, 0.42, 0.5, 0.95], to: [1.4, 0.36, 0.48, 1], portraitX: [0.4, 0.36] },
  ],
};
