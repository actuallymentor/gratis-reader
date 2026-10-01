/**
 * Shared understanding of every request the app sends to OpenRouter's chat
 * endpoint, so mocks can answer batched and single requests alike.
 *
 * Kinds:
 *   sentence        — one sentence with paragraph context (`Translate this sentence:`)
 *   sentence_batch  — several sentences of one paragraph (`Translate these sentences:` + JSON)
 *   word            — one word in a sentence (`Sentence: "…"\n\nWord: x`)
 *   word_batch      — every word of one sentence (`Sentence: "…"\n\nWords: [...]`)
 *   explanation     — the Explain action
 *   meaning         — legacy sentence-meaning prompt (`Adapted translation:`)
 *   unknown
 */
export const CHAT_URL = `**/openrouter.ai/api/v1/chat/completions`

/**
 * Classifies a chat request body.
 * @param {Object} body - `route.request().postDataJSON()`
 * @returns {{ kind: string, system: string, user: string, sentences: string[], context: string|null, sentence: string|null, words: string[], word: string|null, model: string }}
 */
export const parse_chat_request = ( body ) => {

    const system = body?.messages?.find( message => message.role === `system` )?.content || ``
    const user = body?.messages?.find( message => message.role === `user` )?.content || ``
    const base = { system, user, model: body?.model, sentences: [], context: null, sentence: null, words: [], word: null }

    // The system prompt says what kind of request this is; book text inside the user
    // message must never change the classification.
    if( system.includes( `explaining a translation` ) ) return { ...base, kind: `explanation` }
    if( user.includes( `Adapted translation:` ) && !system.includes( `You are a dictionary` ) && !system.includes( `language teacher helping` ) ) return { ...base, kind: `meaning` }

    if( system.includes( `You are a dictionary` ) ) {
        const sentence_end = user.lastIndexOf( `"\n\nWord` )
        const sentence = user.startsWith( `Sentence: "` ) && sentence_end > 0 ? user.slice( `Sentence: "`.length, sentence_end ) : null
        const tail = sentence_end > 0 ? user.slice( sentence_end + 1 ) : ``
        if( tail.startsWith( `\n\nWords: ` ) ) return { ...base, kind: `word_batch`, sentence, words: JSON.parse( tail.slice( `\n\nWords: `.length ) ) }
        if( tail.startsWith( `\n\nWord: ` ) ) {
            const word = tail.slice( `\n\nWord: `.length )
            return { ...base, kind: `word`, sentence, words: [ word ], word }
        }
        return { ...base, kind: `unknown` }
    }

    const context_match = user.match( /^Context \(for reference only — do NOT translate this\):\n"""\n([\s\S]*?)\n"""\n\n/ )
    const context = context_match ? context_match[1] : null
    const after_context = context_match ? user.slice( context_match[0].length ) : user

    if( after_context.startsWith( `Translate these sentences:\n` ) ) {
        const { sentences = [] } = JSON.parse( after_context.slice( `Translate these sentences:\n`.length ).trim() )
        return { ...base, kind: `sentence_batch`, sentences, context }
    }
    if( after_context.startsWith( `Translate this sentence:\n` ) ) {
        const sentence = after_context.slice( `Translate this sentence:\n`.length ).trim()
        return { ...base, kind: `sentence`, sentences: [ sentence ], sentence, context }
    }

    return { ...base, kind: `unknown` }

}

/**
 * Builds an OpenRouter-shaped response body.
 * @param {string|Object} answer - Plain content, or `{ translations: [] }` / `{ glosses: [] }` for batch kinds
 * @param {Object} [usage]
 * @returns {string} JSON body
 */
export const chat_response_body = ( answer, usage = { prompt_tokens: 25, completion_tokens: 15, total_tokens: 40 } ) => JSON.stringify( {
    choices: [ { message: { content: typeof answer === `string` ? answer : JSON.stringify( answer ) } } ],
    usage
} )

/**
 * Fulfils a route with an OpenRouter-shaped success.
 * @param {import('@playwright/test').Route} route
 * @param {string|Object} answer - See chat_response_body
 * @param {Object} [usage]
 */
export const fulfil_chat = ( route, answer, usage ) => route.fulfill( {
    contentType: `application/json`,
    body: chat_response_body( answer, usage )
} )

/**
 * Answers any request kind with per-item results from the given functions.
 * @param {Object} request - Result of parse_chat_request
 * @param {Object} answers
 * @param {Function} [answers.sentence] - sentence text → translated text
 * @param {Function} [answers.word] - ( word, sentence ) → gloss
 * @param {Function} [answers.explanation] - () → explanation text
 * @param {Function} [answers.meaning] - ( user ) → meaning text
 * @returns {string|Object} Something chat_response_body accepts
 */
export const answer_request = ( request, {
    sentence = text => `[TRANSLATED] ${ text }`,
    word = text => `[WORD] definition of the word`,
    explanation = () => `[EXPLANATION] This sentence means something interesting. The original uses formal language that was simplified for the target level.`,
    meaning = user => {
        const sentence_match = user.match( /Adapted translation:\n(.+?)(?:\n\n|$)/s )
        return `[MEANING] ${ sentence_match ? sentence_match[1].trim() : `unknown` }`
    }
} = {} ) => {

    switch ( request.kind ) {
    case `sentence`: return sentence( request.sentence, request )
    case `sentence_batch`: return { translations: request.sentences.map( text => sentence( text, request ) ) }
    case `word`: return word( request.word, request.sentence, request )
    case `word_batch`: return { glosses: request.words.map( text => word( text, request.sentence, request ) ) }
    case `explanation`: return explanation( request )
    case `meaning`: return meaning( request.user, request )
    default: return `[TRANSLATED] unknown`
    }

}
