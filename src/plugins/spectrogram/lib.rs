mod utils;
use wasm_bindgen::prelude::*;
use rustfft::{FftPlanner, num_complex::Complex};
use std::f32::consts::PI;

// Import the `console.log` function from the `console` namespace
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = log)]
    fn log(s: &str);
}

// Define a macro to make logging easier
macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

// Use `wee_alloc` as the global allocator for smaller binary size
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

#[wasm_bindgen]
pub struct WasmFFT {
    size: usize,
    planner: FftPlanner<f32>,
    window: Vec<f32>,
    scratch: Vec<Complex<f32>>,
}

#[wasm_bindgen]
impl WasmFFT {
    #[wasm_bindgen(constructor)]
    pub fn new(size: usize, window_type: &str, alpha: Option<f32>) -> Result<WasmFFT, JsValue> {
        utils::set_panic_hook();
        
        // Validate that size is a power of 2
        if !size.is_power_of_two() {
            return Err(JsValue::from_str("FFT size must be a power of 2"));
        }
        
        let window = create_window(size, window_type, alpha.unwrap_or(0.16))?;
        let scratch = vec![Complex::new(0.0, 0.0); size];
        
        Ok(WasmFFT {
            size,
            planner: FftPlanner::new(),
            window,
            scratch,
        })
    }

    #[wasm_bindgen]
    pub fn calculate_spectrum(&mut self, input: &[f32]) -> Result<Vec<f32>, JsValue> {
        if input.len() != self.size {
            return Err(JsValue::from_str(&format!(
                "Input buffer size {} does not match FFT size {}", 
                input.len(), 
                self.size
            )));
        }

        let fft = self.planner.plan_fft_forward(self.size);
        
        // Apply window and convert to complex
        for (i, (sample, window_val)) in input.iter().zip(self.window.iter()).enumerate() {
            self.scratch[i] = Complex::new(sample * window_val, 0.0);
        }
        
        // Perform FFT
        fft.process(&mut self.scratch);
        
        // Calculate magnitudes (only first half due to symmetry)
        let mut spectrum = Vec::with_capacity(self.size / 2);
        let scale = 2.0 / self.size as f32;
        
        for i in 0..self.size / 2 {
            let magnitude = self.scratch[i].norm() * scale;
            spectrum.push(magnitude);
        }
        
        Ok(spectrum)
    }

    #[wasm_bindgen(getter)]
    pub fn size(&self) -> usize {
        self.size
    }
}

#[wasm_bindgen]
pub struct WasmFilterBank {
    filters: Vec<Vec<f32>>,
    num_filters: usize,
    fft_size: usize,
}

#[wasm_bindgen]
impl WasmFilterBank {
    #[wasm_bindgen(constructor)]
    pub fn new(
        num_filters: usize,
        fft_size: usize,
        sample_rate: f32,
        scale_type: &str,
    ) -> Result<WasmFilterBank, JsValue> {
        let filters = create_filter_bank(num_filters, fft_size, sample_rate, scale_type)?;
        
        Ok(WasmFilterBank {
            filters,
            num_filters,
            fft_size,
        })
    }

    #[wasm_bindgen]
    pub fn apply(&self, spectrum: &[f32]) -> Result<Vec<f32>, JsValue> {
        if spectrum.len() != self.fft_size / 2 {
            return Err(JsValue::from_str(&format!(
                "Spectrum length {} does not match expected size {}", 
                spectrum.len(), 
                self.fft_size / 2
            )));
        }

        let mut filtered = vec![0.0; self.num_filters];
        
        for (i, filter) in self.filters.iter().enumerate() {
            let mut sum = 0.0;
            for (j, &coeff) in filter.iter().enumerate() {
                if j < spectrum.len() {
                    sum += spectrum[j] * coeff;
                }
            }
            filtered[i] = sum;
        }
        
        Ok(filtered)
    }
}

// Helper function to create window functions
fn create_window(size: usize, window_type: &str, alpha: f32) -> Result<Vec<f32>, JsValue> {
    let mut window = vec![0.0; size];
    
    match window_type {
        "bartlett" => {
            for i in 0..size {
                let n = size - 1;
                window[i] = (2.0 / n as f32) * ((n as f32) / 2.0 - ((i as f32) - (n as f32) / 2.0).abs());
            }
        }
        "bartlettHann" => {
            for i in 0..size {
                let n = size - 1;
                let ratio = i as f32 / n as f32;
                window[i] = 0.62 - 0.48 * (ratio - 0.5).abs() - 0.38 * (2.0 * PI * ratio).cos();
            }
        }
        "blackman" => {
            for i in 0..size {
                let n = size - 1;
                let ratio = 2.0 * PI * i as f32 / n as f32;
                window[i] = (1.0 - alpha) / 2.0 - 0.5 * ratio.cos() + (alpha / 2.0) * (2.0 * ratio).cos();
            }
        }
        "cosine" => {
            for i in 0..size {
                let n = size - 1;
                window[i] = (PI * i as f32 / n as f32 - PI / 2.0).cos();
            }
        }
        "gauss" => {
            for i in 0..size {
                let n = size - 1;
                let sigma = alpha * n as f32 / 2.0;
                let x = (i as f32 - n as f32 / 2.0) / sigma;
                window[i] = (-0.5 * x * x).exp();
            }
        }
        "hamming" => {
            for i in 0..size {
                let n = size - 1;
                window[i] = 0.54 - 0.46 * (2.0 * PI * i as f32 / n as f32).cos();
            }
        }
        "hann" | "" => {
            for i in 0..size {
                let n = size - 1;
                window[i] = 0.5 * (1.0 - (2.0 * PI * i as f32 / n as f32).cos());
            }
        }
        "lanczos" => {
            for i in 0..size {
                let n = size - 1;
                let x = 2.0 * i as f32 / n as f32 - 1.0;
                if x == 0.0 {
                    window[i] = 1.0;
                } else {
                    let px = PI * x;
                    window[i] = px.sin() / px;
                }
            }
        }
        "rectangular" => {
            window.fill(1.0);
        }
        "triangular" => {
            for i in 0..size {
                let n = size;
                window[i] = (2.0 / n as f32) * (n as f32 / 2.0 - ((i as f32) - (n as f32 - 1.0) / 2.0).abs());
            }
        }
        _ => {
            return Err(JsValue::from_str(&format!("Unknown window function: {}", window_type)));
        }
    }
    
    Ok(window)
}

// Frequency scaling functions
fn hz_to_mel(hz: f32) -> f32 {
    2595.0 * (1.0 + hz / 700.0).log10()
}

fn mel_to_hz(mel: f32) -> f32 {
    700.0 * (10.0_f32.powf(mel / 2595.0) - 1.0)
}

fn hz_to_log(hz: f32) -> f32 {
    hz.max(1.0).log10()
}

fn log_to_hz(log: f32) -> f32 {
    10.0_f32.powf(log)
}

fn hz_to_bark(hz: f32) -> f32 {
    let mut bark = (26.81 * hz) / (1960.0 + hz) - 0.53;
    if bark < 2.0 {
        bark += 0.15 * (2.0 - bark);
    }
    if bark > 20.1 {
        bark += 0.22 * (bark - 20.1);
    }
    bark
}

fn bark_to_hz(bark: f32) -> f32 {
    let mut b = bark;
    if b < 2.0 {
        b = (b - 0.3) / 0.85;
    }
    if b > 20.1 {
        b = (b + 4.422) / 1.22;
    }
    1960.0 * ((b + 0.53) / (26.28 - b))
}

const ERB_A: f32 = (1000.0 * std::f32::consts::LN_10) / (24.7 * 4.37);

fn hz_to_erb(hz: f32) -> f32 {
    ERB_A * (1.0 + hz * 0.00437).log10()
}

fn erb_to_hz(erb: f32) -> f32 {
    (10.0_f32.powf(erb / ERB_A) - 1.0) / 0.00437
}

// Create filter bank for frequency scaling
fn create_filter_bank(
    num_filters: usize,
    fft_size: usize,
    sample_rate: f32,
    scale_type: &str,
) -> Result<Vec<Vec<f32>>, JsValue> {
    let (hz_to_scale, scale_to_hz): (fn(f32) -> f32, fn(f32) -> f32) = match scale_type {
        "mel" => (hz_to_mel, mel_to_hz),
        "logarithmic" => (hz_to_log, log_to_hz),
        "bark" => (hz_to_bark, bark_to_hz),
        "erb" => (hz_to_erb, erb_to_hz),
        "linear" => return Ok(vec![]), // No filter bank for linear
        _ => return Err(JsValue::from_str(&format!("Unknown scale type: {}", scale_type))),
    };

    let filter_min = hz_to_scale(0.0);
    let filter_max = hz_to_scale(sample_rate / 2.0);
    let mut filter_bank = vec![vec![0.0; fft_size / 2 + 1]; num_filters];
    let scale = sample_rate / fft_size as f32;

    for i in 0..num_filters {
        let hz = scale_to_hz(filter_min + (i as f32 / num_filters as f32) * (filter_max - filter_min));
        let j = (hz / scale).floor() as usize;
        
        if j < fft_size / 2 {
            let hz_low = j as f32 * scale;
            let hz_high = (j + 1) as f32 * scale;
            let r = (hz - hz_low) / (hz_high - hz_low);
            
            filter_bank[i][j] = 1.0 - r;
            if j + 1 < fft_size / 2 + 1 {
                filter_bank[i][j + 1] = r;
            }
        }
    }

    Ok(filter_bank)
}

// Utility function to convert dB values to color indices
#[wasm_bindgen]
pub fn db_to_color_indices(
    spectrum: &[f32],
    gain_db: f32,
    range_db: f32,
) -> Vec<u8> {
    let mut color_indices = Vec::with_capacity(spectrum.len());
    let gain_plus_range = gain_db + range_db;
    
    for &magnitude in spectrum {
        let magnitude = if magnitude > 1e-12 { magnitude } else { 1e-12 };
        let value_db = 20.0 * magnitude.log10();
        
        let color_index = if value_db < -gain_plus_range {
            0
        } else if value_db > -gain_db {
            255
        } else {
            ((value_db + gain_db) / range_db * 255.0 + 256.0).round() as u8
        };
        
        color_indices.push(color_index);
    }
    
    color_indices
} 