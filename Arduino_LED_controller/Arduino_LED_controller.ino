#include <FastLED.h>

#define NUM_LEDS 16
#define DATA_PIN 6
#define FADE_DELAY 10
#define FADE_STEPS 50
#define PACKET_SIZE 50
#define PACKET_TIMEOUT 2000

// Memory trigger header
#define MEMORY_HEADER_1 0xFF
#define MEMORY_HEADER_2 0xFE  
#define MEMORY_HEADER_3 0xFD
#define MEMORY_HEADER_4 0xFC

// Special marker numbers
#define CLEANUP_MARKER 255  // Window closed - turn off all LEDs

CRGB leds[NUM_LEDS];
CRGB targetLeds[NUM_LEDS];

void setup() {
  FastLED.addLeds<WS2811, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setCorrection(UncorrectedColor);
  FastLED.setTemperature(UncorrectedTemperature);
  FastLED.setBrightness(255);
  
  Serial.begin(9600);
  
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::Black;
    targetLeds[i] = CRGB::Black;
  }
  FastLED.show();
  
  Serial.println("Arduino LED Controller Ready");
}

void loop() {
  if (Serial.available() > 0) {
    // Wait for enough data to arrive
    unsigned long waitStart = millis();
    while (Serial.available() < PACKET_SIZE && (millis() - waitStart) < 500) {
      delay(10);
    }
    
    // If we still don't have enough data, clear and wait
    if (Serial.available() < PACKET_SIZE) {
      while (Serial.available() > 0) {
        Serial.read();
      }
      return;
    }
    
    uint8_t packet[PACKET_SIZE];
    int bytesRead = 0;
    unsigned long startTime = millis();
    
    // Read packet
    while (bytesRead < PACKET_SIZE && (millis() - startTime) < PACKET_TIMEOUT) {
      if (Serial.available() > 0) {
        packet[bytesRead++] = Serial.read();
      }
    }
    
    // Validate complete packet
    if (bytesRead != PACKET_SIZE) {
      while (Serial.available() > 0) {
        Serial.read();
      }
      return;
    }
    
    // Process packet
    if (packet[0] == MEMORY_HEADER_1 && 
        packet[1] == MEMORY_HEADER_2 && 
        packet[2] == MEMORY_HEADER_3 && 
        packet[3] == MEMORY_HEADER_4) {
      handleMemoryTrigger(packet);
    } else {
      handleRegularCommand(packet);
    }
  }
}

void handleRegularCommand(uint8_t* packet) {
  uint16_t ledBits = (packet[0] << 8) | packet[1];
  
  // Update target colors
  bool anyChange = false;
  for (int i = 0; i < NUM_LEDS; i++) {
    int colorIndex = 2 + (i * 3);
    
    uint8_t r = packet[colorIndex];
    uint8_t g = packet[colorIndex + 1];
    uint8_t b = packet[colorIndex + 2];
    
    CRGB newColor;
    if (ledBits & (1 << (NUM_LEDS - 1 - i))) {
      newColor = CRGB(r, g, b);
    } else {
      newColor = CRGB::Black;
    }
    
    if (targetLeds[i] != newColor) {
      targetLeds[i] = newColor;
      anyChange = true;
    }
  }
  
  if (anyChange) {
    fadeToTarget();
  }
}

void handleMemoryTrigger(uint8_t* packet) {
  uint8_t markerNumber = packet[4];
  uint8_t r = packet[5];
  uint8_t g = packet[6];
  uint8_t b = packet[7];
  
  // Check for cleanup signal (marker 255)
  if (markerNumber == CLEANUP_MARKER) {
    handleCleanupSignal();
    return;
  }
  
  // Check for valid marker range (1-16)
  if (markerNumber < 1 || markerNumber > 16) {
    Serial.println("Invalid marker number");
    return;
  }
  
  executeMemoryFunction(markerNumber, r, g, b);
}

void handleCleanupSignal() {
  Serial.println("Window closed - LEDs off");
  
  // Immediately turn off all LEDs
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::Black;
    targetLeds[i] = CRGB::Black;
  }
  FastLED.show();
  
  // Clear any pending serial data
  while (Serial.available() > 0) {
    Serial.read();
  }
}

void executeMemoryFunction(uint8_t markerNumber, uint8_t r, uint8_t g, uint8_t b) {
  // Store current target state
  CRGB originalTargets[NUM_LEDS];
  for (int i = 0; i < NUM_LEDS; i++) {
    originalTargets[i] = targetLeds[i];
  }
  
  // Execute wave effect
  executeSpreadingWave(r, g, b, 800, 500, 4);
  
  // Flush buffer to skip packets that arrived during wave
  unsigned long flushStart = millis();
  while (millis() - flushStart < 600) {
    if (Serial.available() >= PACKET_SIZE) {
      for (int i = 0; i < PACKET_SIZE; i++) {
        Serial.read();
      }
    } else if (Serial.available() > 0) {
      Serial.read();
    }
    delay(10);
  }
  
  // Restore state
  for (int i = 0; i < NUM_LEDS; i++) {
    targetLeds[i] = originalTargets[i];
    leds[i] = originalTargets[i];
  }
  FastLED.show();
}

void executeSpreadingWave(uint8_t r, uint8_t g, uint8_t b, int holdTime, int waveSpeed, int maxDistance) {
  CRGB markerColor = CRGB(r, g, b);
  bool ledTriggered[NUM_LEDS];
  CRGB ledTargets[NUM_LEDS];
  
  // Initialize all LEDs off
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::Black;
    ledTriggered[i] = false;
    ledTargets[i] = CRGB::Black;
  }
  FastLED.show();
  
  int fadeSteps = 20;
  
  // Propagate wave - LEDs fade in and stay lit
  for (int waveStep = 0; waveStep <= maxDistance; waveStep++) {
    // Mark new LEDs to be lit this step
    for (int center = 0; center < NUM_LEDS; center++) {
      if (waveStep == 0 || ledTriggered[center]) {
        for (int offset = -waveStep; offset <= waveStep; offset++) {
          int ledIndex = center + offset;
          
          // Circular wrapping
          while (ledIndex < 0) ledIndex += NUM_LEDS;
          while (ledIndex >= NUM_LEDS) ledIndex -= NUM_LEDS;
          
          if (!ledTriggered[ledIndex]) {
            ledTargets[ledIndex] = markerColor;
            ledTriggered[ledIndex] = true;
          }
        }
      }
    }
    
    // Fade all LEDs toward their targets
    for (int fadeStep = 0; fadeStep <= fadeSteps; fadeStep++) {
      for (int i = 0; i < NUM_LEDS; i++) {
        if (ledTriggered[i] && leds[i] != ledTargets[i]) {
          leds[i] = blend(leds[i], ledTargets[i], (fadeStep * 255) / fadeSteps);
        }
      }
      FastLED.show();
      delay(waveSpeed / fadeSteps);
    }
  }
  
  // Ensure all LEDs are fully lit
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = markerColor;
  }
  FastLED.show();
  
  // Hold all LEDs lit in marker color
  delay(holdTime);
}

void fadeToTarget() {
  for (int step = 0; step <= FADE_STEPS; step++) {
    bool anyActive = false;
    for (int i = 0; i < NUM_LEDS; i++) {
      if (leds[i] != targetLeds[i]) {
        leds[i] = blend(leds[i], targetLeds[i], (step * 255) / FADE_STEPS);
        anyActive = true;
      }
    }
    if (anyActive) {
      FastLED.show();
      delay(FADE_DELAY);
    } else {
      break;
    }
  }
}