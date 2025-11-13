#include <FastLED.h>

#define NUM_LEDS 16
#define DATA_PIN 6
#define FADE_DELAY 10
#define FADE_STEPS 50
#define PACKET_SIZE 50
#define PACKET_TIMEOUT 2000

// Beginning header
#define START_HEADER_1 0xFC
#define START_HEADER_2 0xFD  
#define START_HEADER_3 0xFE
#define START_HEADER_4 0xFF

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
    if (packet[0] == START_HEADER_1 && 
        packet[1] == START_HEADER_2 && 
        packet[2] == START_HEADER_3 && 
        packet[3] == START_HEADER_4) {
        handleBeginningPacket(packet);
    } else if (packet[0] == MEMORY_HEADER_1 && 
               packet[1] == MEMORY_HEADER_2 && 
               packet[2] == MEMORY_HEADER_3 && 
               packet[3] == MEMORY_HEADER_4) {
        handleMemoryTrigger(packet);
    } else {
        handleRegularCommand(packet);
    }
  }
}

void handleBeginningPacket(uint8_t* packet) {
  Serial.println("Beginning packet received - Starting RGB breathing effect");
  
  // Clear serial buffer
  while (Serial.available() > 0) {
    Serial.read();
  }
  
  executeSpiralEffect(255, 255, 255, 200)
  
  // Turn off all LEDs after breathing
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::Black;
    targetLeds[i] = CRGB::Black;
  }
  FastLED.show();
  
  Serial.println("RGB breathing complete - Ready for commands");
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
  executeSpreadingWaveFromMarker(startLedIndex, r, g, b, 800, 50, 8);
  
  // After wave completes, keep ALL LEDs lit in the marker color
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB(r, g, b);
    targetLeds[i] = CRGB(r, g, b);
  }
  FastLED.show();
  
  Serial.println("Memory effect complete - LEDs staying lit until resume");
}

void executeSpiralEffect(uint8_t r, uint8_t g, uint8_t b, int stepDelay) {
  CRGB spiralColor = CRGB(r, g, b);
  
  // Turn off all LEDs first
  for (int i = 0; i < NUM_LEDS; i++) {
    leds[i] = CRGB::Black;
  }
  FastLED.show();
  delay(100);
  
  // Spiral sequence for 4x4 matrix mapped to 16 LEDs (0-15)
  // Matrix positions (row, col) mapped to LED indices:
  // A11=0, A12=1, A13=2, A14=3
  // A21=4, A22=5, A23=6, A24=7
  // A31=8, A32=9, A33=10, A34=11
  // A41=12, A42=13, A43=14, A44=15
  
  int spiralSequence[16] = {
    0,  // A11
    1,  // A12
    2,  // A13
    3,  // A14
    7,  // A24
    11, // A34
    15, // A44
    14, // A43
    13, // A42
    12, // A41
    8,  // A31
    4,  // A21
    5,  // A22
    6,  // A23
    10, // A33
    9   // A32
  };
  
  int fadeSteps = 50;
  
  // Light up each LED in spiral sequence
  for (int pos = 0; pos < 16; pos++) {
    int ledIndex = spiralSequence[pos];
    
    // Fade in current LED
    for (int fadeStep = 0; fadeStep <= fadeSteps; fadeStep++) {
      leds[ledIndex] = blend(CRGB::Black, spiralColor, (fadeStep * 255) / fadeSteps);
      FastLED.show();
      delay(stepDelay / fadeSteps);
    }
    
    // Ensure fully lit
    leds[ledIndex] = spiralColor;
    FastLED.show();
    delay(stepDelay);
  }
  
  // Hold all LEDs lit
  delay(500);
  
  Serial.println("Spiral effect complete");
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
  
  int fadeSteps = 50;
  
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
