import { log } from 'mentie'

const BASE_URL = `https://openrouter.ai/api/v1`
const REQUEST_TIMEOUT_MS = 60_000

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

// Rate-limit and overload responses may say when to come back
const retry_after_ms = ( response ) => {
    const header = response.headers.get( `retry-after` )
    if( !header ) return undefined
    const seconds = Number( header )
    if( Number.isFinite( seconds ) ) return seconds * 1000
    const at = Date.parse( header )
    return Number.isFinite( at ) ? Math.max( 0, at - Date.now() ) : undefined
}

/**
 * Sends a chat completion request to OpenRouter
 * @param {Object} options
 * @param {string} options.api_key
 * @param {string} options.model
 * @param {string} options.system_prompt
 * @param {string} options.user_message
 * @param {number} [options.temperature=0.3]
 * @param {number} [options.max_tokens] - Ceiling for a runaway completion (reasoning tokens count too)
 * @param {boolean} [options.json] - Ask for a JSON object response where the model supports it
 * @param {AbortSignal} [options.signal] - For request cancellation
 * @returns {Promise<{ content: string, usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } }>}
 * @throws {Error} With `status`, `retry_after_ms` (from Retry-After on 429/503) and `usage` (when the call was billed) where known
 */
export const chat_completion = async ( { api_key, model, system_prompt, user_message, temperature = 0.3, max_tokens, json = false, signal } ) => {

    // Log entry
    log.debug( `Translating ${ user_message?.length } chars with "${ model }" (sys ${ system_prompt?.length } chars) and temperature ${ temperature }` )
    log.insane( `Translation details:`, { user_message, system_prompt, model, temperature } )

    // A caller signal handles navigation/offline cancellation. This controller
    // adds a hard deadline that remains active through response body parsing.
    const request_controller = new AbortController()
    const cancel_request = () => request_controller.abort()
    const timeout_id = setTimeout( cancel_request, REQUEST_TIMEOUT_MS )

    if( signal?.aborted ) cancel_request()
    else signal?.addEventListener( `abort`, cancel_request, { once: true } )

    try {
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
                temperature,
                ...max_tokens ? { max_tokens } : {},
                ...json ? { response_format: { type: `json_object` } } : {}
            } ),
            signal: request_controller.signal
        } )

        if( !response.ok ) {
            const error_text = await response.text().catch( () => `Unknown error` )
            log.error( `OpenRouter error ${ response.status }:`, error_text )
            throw Object.assign( new Error( `OpenRouter error: ${ response.status }` ), {
                status: response.status,
                retry_after_ms: retry_after_ms( response )
            } )
        }

        let data
        try {
            data = await response.clone().json()
        } catch {
            log.debug( `Failed to parse OpenRouter response as JSON. Response text:`, await response.text() )
            throw new Error( `OpenRouter returned invalid JSON (possible maintenance page)` )
        }

        const { choices, usage: raw_usage } = data
        const usage = {
            prompt_tokens: raw_usage?.prompt_tokens || 0,
            completion_tokens: raw_usage?.completion_tokens || 0,
            total_tokens: raw_usage?.total_tokens || 0
        }

        // An empty answer was still billed: callers record `error.usage`
        if( !choices?.length || !choices[0]?.message?.content ) {
            log.debug( `OpenRouter response missing expected fields. Full response data:`, data )
            throw Object.assign( new Error( `OpenRouter returned an empty or malformed response` ), { usage } )
        }

        const content = choices[0].message.content.trim()
        if( !content ) {
            log.debug( `OpenRouter response contained only whitespace. Full response data:`, data )
            throw Object.assign( new Error( `OpenRouter returned an empty or malformed response` ), { usage } )
        }

        return { content, usage }
    } finally {
        clearTimeout( timeout_id )
        signal?.removeEventListener( `abort`, cancel_request )
    }

}
