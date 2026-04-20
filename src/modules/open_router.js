import { log } from 'mentie'

const BASE_URL = `https://openrouter.ai/api/v1`

/**
 * Validates an OpenRouter API key by calling the /auth/key endpoint
 * @param {string} api_key
 * @returns {Promise<boolean>} true if valid, false if server rejects
 * @throws {Error} On network failure or timeout
 */
export const validate_api_key = async ( api_key ) => {

    const timeout_controller = new AbortController()
    const timeout_id = setTimeout( () => timeout_controller.abort(), 15000 )

    try {

        const response = await fetch( `${ BASE_URL }/auth/key`, {
            headers: { 'Authorization': `Bearer ${ api_key }` },
            signal: timeout_controller.signal
        } )

        clearTimeout( timeout_id )
        return response.ok

    } catch ( error ) {
        clearTimeout( timeout_id )
        log.error( `API key validation failed:`, error )
        // Re-throw network/timeout errors so callers can distinguish
        // "invalid key" (false) from "couldn't reach server" (throw)
        throw error
    }

}

/**
 * Sends a chat completion request to OpenRouter
 * @param {Object} options
 * @param {string} options.api_key
 * @param {string} options.model
 * @param {string} options.system_prompt
 * @param {string} options.user_message
 * @param {number} [options.temperature=0.3]
 * @param {AbortSignal} [options.signal] - For request cancellation
 * @returns {Promise<{ content: string, usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } }>}
 */
export const chat_completion = async ( { api_key, model, system_prompt, user_message, temperature = 0.3, signal } ) => {

    // Log entry
    log.debug( `Translating ${ user_message?.length } chars with "${ model }" (sys ${ system_prompt?.length } chars) and temperature ${ temperature }` )
    log.insane( `Translation details:`, { user_message, system_prompt, model, temperature } )

    // Add a 60-second timeout if no external signal is provided
    let timeout_id
    let effective_signal = signal
    if( !signal ) {
        const timeout_controller = new AbortController()
        timeout_id = setTimeout( () => timeout_controller.abort(), 60000 )
        effective_signal = timeout_controller.signal
    }

    const response = await fetch( `${ BASE_URL }/chat/completions`, {
        method: `POST`,
        headers: {
            'Authorization': `Bearer ${ api_key }`,
            'Content-Type': `application/json`,
            'X-Title': `Gratis Reader`
        },
        body: JSON.stringify( {
            model,
            messages: [
                { role: `system`, content: system_prompt },
                { role: `user`, content: user_message }
            ],
            temperature
        } ),
        signal: effective_signal
    } )

    if( timeout_id ) clearTimeout( timeout_id )

    if( !response.ok ) {
        const error_text = await response.text().catch( () => `Unknown error` )
        log.error( `OpenRouter error ${ response.status }:`, error_text )
        throw new Error( `OpenRouter error: ${ response.status }` )
    }

    let data
    try {
        data = await response.clone().json()
    } catch {
        log.debug( `Failed to parse OpenRouter response as JSON. Response text:`, await response.text() )
        throw new Error( `OpenRouter returned invalid JSON (possible maintenance page)` )
    }

    const { choices, usage } = data

    if( !choices?.length || !choices[0]?.message?.content ) {
        log.debug( `OpenRouter response missing expected fields. Full response data:`, data )
        throw new Error( `OpenRouter returned an empty or malformed response` )
    }

    return {
        content: choices[0].message.content.trim(),
        usage: {
            prompt_tokens: usage?.prompt_tokens || 0,
            completion_tokens: usage?.completion_tokens || 0,
            total_tokens: usage?.total_tokens || 0
        }
    }

}
