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
#define CLEANUP_MARKER 255

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
  Serial.print("Memory trigger received - Marker: ");
  Serial.print(markerNumber);
  Serial.print(", RGB: (");
  Serial.print(r);
  Serial.print(",");
  Serial.print(g);
  Serial.print(",");
  Serial.print(b);
  Serial.println(")");
  
  // Clear serial buffer before starting effect
  while (Serial.available() > 0) {
    Serial.read();
  }
  
  // Convert marker number (1-16) to LED index (0-15)
  int startLedIndex = markerNumber - 1;
  
  // Execute wave effect starting from this specific marker
  executeSpreadingWaveFromMarker(startLedIndex, r, g, b, 800, 150, 8);
  
  // After wave completes, keep ALL LEDs lit in the marker color
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB(r, g, b);
    targetLeds[i] = CRGB(r, g, b);
  }
  FastLED.show();
  
  Serial.println("Memory effect complete - LEDs staying lit until resume");
}

void executeSpreadingWaveFromMarker(int startIndex, uint8_t r, uint8_t g, uint8_t b, int holdTime, int waveSpeed, int maxDistance) {
  CRGB markerColor = CRGB(r, g, b);
  
  // Turn off all LEDs first
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::Black;
  }
  FastLED.show();
  delay(100);
  
  // Light up the starting marker LED (center)
  leds[startIndex] = markerColor;
  FastLED.show();
  delay(200);  // Pause to show starting position
  
  int fadeSteps = 100;
  
  // Propagate wave outward in FOUR directions (cross/plus pattern)
  for (int distance = 1; distance <= maxDistance; distance++) {
    // Calculate LEDs at current distance in all 4 directions
    // Using distance for horizontal (left/right) and distance*4 for vertical (up/down)
    // to create a cross pattern on a circular LED ring
    int indices[4];
    indices[0] = startIndex - distance;           // Left
    indices[1] = startIndex + distance;           // Right  
    indices[2] = startIndex - (NUM_LEDS / 4);     // Up (quarter circle = 4 LEDs for 16 LED ring)
    indices[3] = startIndex + (NUM_LEDS / 4);     // Down (quarter circle)
    
    // For distance > 1, also extend up/down
    if (distance > 1) {
      indices[2] = startIndex - (NUM_LEDS / 4) - (distance - 1);
      indices[3] = startIndex + (NUM_LEDS / 4) + (distance - 1);
    }
    
    // Circular wrapping for all indices
    for (int i = 0; i < 4; i++) {
      while (indices[i] < 0) indices[i] += NUM_LEDS;
      while (indices[i] >= NUM_LEDS) indices[i] -= NUM_LEDS;
    }
    
    // Fade in LEDs at current distance in all 4 directions simultaneously
    for (int fadeStep = 0; fadeStep <= fadeSteps; fadeStep++) {
      for (int i = 0; i < 4; i++) {
        if (leds[indices[i]] == CRGB::Black) {
          leds[indices[i]] = blend(CRGB::Black, markerColor, (fadeStep * 255) / fadeSteps);
        }
      }
      FastLED.show();
      delay(waveSpeed / fadeSteps);
    }
    
    // Ensure they're fully lit
    for (int i = 0; i < 4; i++) {
      leds[indices[i]] = markerColor;
    }
    FastLED.show();
    delay(50);  // Pause between wave steps
  }
  
  // Ensure all LEDs are lit
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = markerColor;
  }
  FastLED.show();
  delay(holdTime);
}

void executeSpreadingWave(uint8_t r, uint8_t g, uint8_t b, int holdTime, int waveSpeed, int maxDistance) {
  CRGB markerColor = CRGB(r, g, b);
  
  // Initialize all LEDs off
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::Black;
  }
  FastLED.show();
  delay(100);
  
  int fadeSteps = 100;
  
  // Propagate wave from each LED position outward
  for (int distance = 0; distance <= maxDistance; distance++) {
    // For each distance step, light up LEDs at that distance from ANY already-lit LED
    bool newLEDs[NUM_LEDS];
    for (int i = 0; i < NUM_LEDS; i++) {
      newLEDs[i] = false;
    }
    
    // Find which LEDs should light up at this distance
    for (int center = 0; center < NUM_LEDS; center++) {
      // On first step (distance 0), all LEDs are "centers"
      // On subsequent steps, only already-lit LEDs are centers
      if (distance == 0 || leds[center] != CRGB::Black) {
        // Light up LEDs at current distance from this center
        for (int dir = -1; dir <= 1; dir += 2) {  // -1 for left, +1 for right
          int ledIndex = center + (dir * distance);
          
          // Circular wrapping
          while (ledIndex < 0) ledIndex += NUM_LEDS;
          while (ledIndex >= NUM_LEDS) ledIndex -= NUM_LEDS;
          
          // Mark this LED to be lit if not already lit
          if (leds[ledIndex] == CRGB::Black) {
            newLEDs[ledIndex] = true;
          }
        }
      }
    }
    
    // Fade in the new LEDs
    for (int fadeStep = 0; fadeStep <= fadeSteps; fadeStep++) {
      for (int i = 0; i < NUM_LEDS; i++) {
        if (newLEDs[i]) {
          leds[i] = blend(CRGB::Black, markerColor, (fadeStep * 255) / fadeSteps);
        }
      }
      FastLED.show();
      delay(waveSpeed / fadeSteps);
    }
    
    // Ensure newly lit LEDs are fully on
    for (int i = 0; i < NUM_LEDS; i++) {
      if (newLEDs[i]) {
        leds[i] = markerColor;
      }
    }
    FastLED.show();
    
    // Pause between wave steps
    delay(50);
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