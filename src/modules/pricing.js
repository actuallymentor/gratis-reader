
/**
 * Approximate cost estimation for OpenRouter models
 * Prices in USD per 1M tokens (input / output)
 * Updated periodically — these are rough estimates for display only
 */

// Default fallback: assume a cheap model (~GPT-4o-mini pricing)
const DEFAULT_INPUT_PER_M = 0.15
const DEFAULT_OUTPUT_PER_M = 0.60

// Known model pricing (per 1M tokens)
const MODEL_PRICING = {
    'openai/gpt-4o-mini': { input: 0.15, output: 0.60 },
    'openai/gpt-4o': { input: 2.50, output: 10.00 },
    'openai/gpt-4.1-mini': { input: 0.40, output: 1.60 },
    'openai/gpt-4.1-nano': { input: 0.10, output: 0.40 },
    'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
    'anthropic/claude-3-haiku': { input: 0.25, output: 1.25 },
    'google/gemini-2.0-flash-001': { input: 0.10, output: 0.40 },
    'google/gemini-flash-1.5': { input: 0.075, output: 0.30 },
    'meta-llama/llama-3.1-8b-instruct': { input: 0.06, output: 0.06 },
    'mistralai/mistral-small': { input: 0.20, output: 0.60 },
}

/**
 * Estimates cost for given token counts and model
 * @param {number} prompt_tokens
 * @param {number} completion_tokens
 * @param {string} [model] - OpenRouter model ID
 * @returns {number} Estimated cost in USD
 */
export const estimate_cost = ( prompt_tokens, completion_tokens, model ) => {

    // Try exact match first, then prefix match for model variants
    let pricing = model ? MODEL_PRICING[model] : null
    if( !pricing && model ) {
        const match = Object.keys( MODEL_PRICING ).find( key => model.startsWith( key ) )
        if( match ) pricing = MODEL_PRICING[match]
    }

    const input_rate = pricing?.input ?? DEFAULT_INPUT_PER_M
    const output_rate = pricing?.output ?? DEFAULT_OUTPUT_PER_M

    return ( prompt_tokens * input_rate + completion_tokens * output_rate ) / 1_000_000

}

/**
 * Formats a token count for human display (e.g., 1234 → "1.2K")
 * @param {number} tokens
 * @returns {string}
 */
export const format_tokens = ( tokens ) => {
    if( tokens < 1000 ) return `${ tokens }`
    if( tokens < 1_000_000 ) return `${ ( tokens / 1000 ).toFixed( 1 ) }K`
    return `${ ( tokens / 1_000_000 ).toFixed( 2 ) }M`
}

/**
 * Formats a USD cost for display (e.g., 0.0023 → "$0.002", 1.50 → "$1.50")
 * @param {number} cost
 * @returns {string}
 */
export const format_cost = ( cost ) => {
    if( cost < 0.001 ) return `<$0.001`
    if( cost < 0.01 ) return `~$${ cost.toFixed( 3 ) }`
    if( cost < 1 ) return `~$${ cost.toFixed( 2 ) }`
    return `~$${ cost.toFixed( 2 ) }`
}
