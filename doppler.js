window.doppler = (function() {
  var AuContext = (window.AudioContext ||
                   window.webkitAudioContext ||
                   window.mozAudioContext ||
                   window.oAudioContext ||
                   window.msAudioContext);

  var context = new AuContext();
  var oscillator = context.createOscillator();

  var freq = 20000;

  var relevantFreqWindow = 33;

  var getBandwidth = function(analyser, freqs) {
    var primaryTone = freqToIndex(analyser, freq);
    var primaryVolume = freqs[primaryTone];

    var maxVolumeRatio = 0.001;

    var leftBandwidth = 0;
    do {
      leftBandwidth++;
      var volume = freqs[primaryTone-leftBandwidth];
      var normalizedVolume = volume / primaryVolume;
    } while (normalizedVolume > maxVolumeRatio && leftBandwidth < relevantFreqWindow);

    var rightBandwidth = 0;
    do {
      rightBandwidth++;
      var volume = freqs[primaryTone+rightBandwidth];
      var normalizedVolume = volume / primaryVolume;
    } while (normalizedVolume > maxVolumeRatio && rightBandwidth < relevantFreqWindow);

    return { left: leftBandwidth, right: rightBandwidth };
  };

  var freqToIndex = function(analyser, freq) {
    var nyquist_freq = context.sampleRate / 2;
    return Math.round( freq/nyquist_freq * analyser.fftSize/2 );
  };

  var indexToFreq = function(analyser, index) {
    var nyquist_freq = context.sampleRate / 2;
    return nyquist_freq/(analyser.fftSize/2) * index;
  };

  var optimizeFrequency = function(oscillator, analyser, freqSweepStart, freqSweepEnd) {
    var oldFreq = oscillator.frequency.value;

    var audioData = new Uint8Array(analyser.frequencyBinCount);
    var maxAmp = 0;
    var maxAmpIndex = 0;

    var from = freqToIndex(analyser, freqSweepStart);
    var to   = freqToIndex(analyser, freqSweepEnd);
    for (var i = from; i < to; i++) {
      oscillator.frequency.value = indexToFreq(analyser, i);
      analyser.getByteFrequencyData(audioData);

      if (audioData[i] > maxAmp) {
        maxAmp = audioData[i];
        maxAmpIndex = i;
      }
    }

    if (maxAmpIndex == 0) {
      return oldFreq;
    }
    else {
      return indexToFreq(analyser, maxAmpIndex);
    }
  };

  var readMicInterval = 0;
  var readMic = function(analyser, userCallback) {
    var audioData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(audioData);

    var band = getBandwidth(analyser, audioData);
    userCallback(band);

    readMicInterval = setTimeout(readMic, 1, analyser, userCallback);
  };

  var handleMic = function(stream, callback, userCallback) {

    var mic = context.createMediaStreamSource(stream);
    var analyser = context.createAnalyser();

    analyser.smoothingTimeConstant = 0.5;
    analyser.fftSize = 2048;

    mic.connect(analyser);

    oscillator.frequency.value = freq;
    oscillator.type = oscillator.SINE;
    oscillator.start(0);
    oscillator.connect(context.destination);

    setTimeout(function() {

      freq = optimizeFrequency(oscillator, analyser, 19000, 22000);
      oscillator.frequency.value = freq;

      clearInterval(readMicInterval);
      callback(analyser, userCallback);
    });
  };

  return {
    init: function(callback) {
      navigator.getUserMedia_ = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
      navigator.getUserMedia_({ audio: { optional: [{ echoCancellation: false }] } }, function(stream) {
        handleMic(stream, readMic, callback);
      }, function() { console.log('Error!') });
    },
    stop: function () {
      clearInterval(readMicInterval);
    }
  }
})(window, document);
