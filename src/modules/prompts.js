import { multiline_trim } from 'mentie'

// --- Level definitions ---

export const LEVELS = [
    { code: `a1`, label: `Toddler`, cefr: `A1`, description: `Very simple words, short sentences`,
        lvl_guidelines: `Use only the most basic vocabulary and very simple sentence structures. Avoid any complex grammar or idiomatic expressions.`,
        lvl_example: multiline_trim( `
            1. Original: "The building's architecture is reminiscent of the Gothic beauty of a European cathedral"
            2. Rewritten: "The building is beautiful."
            3. Then translate the rewritten sentence into the target language.
        ` )
    },
    { code: `a2`, label: `Primary Schooler`, cefr: `A2`, description: `Basic vocabulary, simple structure`,
        lvl_guidelines: `Use basic vocabulary and simple sentence structures. Lightly simplify complex ideas but keep the main point. Basic conjunctions (and, but, because) are ok.`,
        lvl_example: multiline_trim( `
            1. Original: "The building's architecture is reminiscent of the Gothic beauty of a European cathedral"
            2. Rewritten: "The building is very beautiful and old, like a famous church in Europe."
            3. Then translate the rewritten sentence into the target language.
        ` )
    },
    { code: `b1-b2`, label: `High Schooler`, cefr: `B1-B2`, description: `Moderate vocabulary, compound sentences`,
        lvl_guidelines: `Use moderate vocabulary. Compound and complex sentences are fine. Preserve the main meaning but simplify obscure idioms and cultural references. Approximate literary style.`,
        lvl_example: multiline_trim( `
            1. Original: "The building's architecture is reminiscent of the Gothic beauty of a European cathedral"
            2. Rewritten: "The building's design reminds me of the beautiful Gothic cathedrals you see in Europe."
            3. Then translate the rewritten sentence into the target language.
        ` )
    },
    { code: `c1-c2`, label: `Adult`, cefr: `C1-C2`, description: `Full complexity, nuance is preserved`,
        lvl_guidelines: `Full vocabulary and natural expression. Preserve style, tone, literary devices, and nuance. This should read like a professional translation.`,
        lvl_example: multiline_trim( `
            1. Original: "The building's architecture is reminiscent of the Gothic beauty of a European cathedral"
            2. No rewrite needed
            3. Translate to the best of your ability, preserving the full meaning and style.
        ` )
    },
]

// Common languages promoted at top of picker
export const COMMON_LANGUAGES = [
    `Spanish`, `French`, `German`, `Italian`, `Portuguese`,
    `Chinese`, `Japanese`, `Korean`, `Albanian (Gheg, Kosovar)`, `Arabic`,
    `Russian`, `Hindi`, `Dutch`, `Swedish`, `Turkish`,
    `Greek`, `Polish`, `Czech`, `Romanian`, `Thai`
]

// Language translation notes for prompt construction
export const LANGUAGE_NOTES = {
    [`Albanian (Gheg, Kosovar)`]: multiline_trim( `

        Translate to Geg Albanian as spoken in Kosovo, which is more colloquial.

        Core transformations:
        - të + verb -> me + verb (të flas -> me fol, të shkoj -> me shku)
        - po + verb -> jam tu + verb (po punoj -> jam tu punu)
        - mund të + verb -> din me + verb (A mund të flasësh -> A din me fol)

        Key vocabulary:
        - çfarë -> çka
        - ku -> kah (directional)
        - dua -> du
        - është -> osht
        - kam -> kom
        - nuk -> s' (when natural)
        - por -> po
        
        Examples of Albanian Tosk vs Kosovar Gheg:
        - Tosk (wrong): A mund të flasësh anglisht?
          Kovovar Gheg (correct): A din me fol anglisht?
        - Tosk (wrong): Babai im është nga Kosova
          Kovovar Gheg (correct): Babai jem asht prej Kosovës
        - Tosk (wrong): Çfarë do të thotë kjo?
          Kovovar Gheg (correct): Çka do me thanë kjo?
        - Tosk (wrong): Po mësoj shqip
          Kovovar Gheg (correct): Jam tu mësu shqip
    ` )
}

/**
 * Builds the system prompt for sentence translation
 * @param {string} source_language
 * @param {string} target_language
 * @param {string} cefr_code - e.g. 'a1', 'b2'
 * @param {string} level_label - e.g. 'Toddler', 'High Schooler'
 * @returns {string}
 */
export const build_translation_system_prompt = ( source_language, target_language, cefr_code ) => {

    // Check that the ceft code is in the LEVELS array
    const level_info = LEVELS.find( l => l.code === cefr_code )
    if( !level_info ) throw new Error( `Invalid CEFR code: ${ cefr_code }` )
    const { label, description, lvl_guidelines, lvl_example } = level_info
        
    return multiline_trim( `
        You are a language teacher helping a student learn ${ target_language }. You rewrite text from ${ source_language } into ${ target_language } at the ${ label } level, meaning ${ description } (CEFR ${ cefr_code.toUpperCase() }).

        ## Translation goals:

        Your translations are not literal word-for-word translations.
        It is ok and often desirable to simplify, condense, or even omit parts of the original sentence if they are too complex for the target level.
        The goal is to convey the core meaning in a way that is comprehensible and natural for a learner at the specified level.

        ## ${ label } translation guidelines:

        Use ${ label }-appropriate vocabulary and sentence structures. ${ lvl_guidelines }
        Example translation steps: ${ lvl_example }

        ## Rules & boundaries:

        0. Before translating, rewrite the original input to match the vocabulary and complexity of the target level.
        1. Output ONLY the translated/rewritten sentence
        2. No quotes around the output
        3. No explanations, notes, or comments
        4. No markup or formatting
        5. If the sentence is a heading or title, translate it maintaining its brevity
        6. Maintain the same punctuation style (periods, question marks, etc.)
    ` )
}

/**
 * Builds the user message for translating a single sentence with context
 * @param {string} sentence - The target sentence to translate
 * @param {string} context - The surrounding paragraph for coherence
 * @returns {string}
 */
export const build_translation_user_prompt = ( sentence, context ) => {

    return multiline_trim( `
    Sencence context (for reference only — do NOT translate this):
    """
    ${ context }
    """

    Translate this sentence:
    ${ sentence }
` )
}

/**
 * Builds the prompt for explaining a translation (long-press feature)
 * @param {string} source_language
 * @param {string} target_language
 * @param {string} level_label
 * @param {string} original_sentence
 * @param {string} translated_sentence
 * @returns {Object} { system, user } message pair
 */
export const build_explanation_prompt = ( source_language, target_language, level_label, original_sentence, translated_sentence ) => {

    const level_info = LEVELS.find( l => l.label === level_label )
    if( !level_info ) throw new Error( `Invalid level label: ${ level_label }` )
    const { label, description, cefr } = level_info

    return  {


        system: multiline_trim( `
        You are a language teacher explaining a translation to a student who is
        learning ${ target_language }. The student's native language is ${ source_language }.
        They are learning at the ${ label } level, meaning ${ description } (CEFR ${ cefr })

        Given an original sentence and its adapted translation, explain:
        1. A phrase-by-phrase mapping between original and translation
        2. Why specific words or phrases were changed or simplified
        3. Key grammar points visible in the translation
        4. Any nuance or cultural context that was lost or changed

        Write your explanation in ${ source_language } since the student is still
        learning. Keep it concise — under 200 words.
    ` ),

        user: multiline_trim( `
        Original: "${ original_sentence }"
        Translation: "${ translated_sentence }"

        Explain this translation.
    ` )

    } 
}

/**
 * Builds a prompt for looking up a single word's translation
 * @param {string} word
 * @param {string} source_language
 * @param {string} target_language
 * @param {string} sentence_context
 * @returns {Object} { system, user }
 */
export const build_word_lookup_prompt = ( word, source_language, target_language, sentence_context ) => ( {

    system: multiline_trim( `
        You are a dictionary. Given a word in ${ target_language }, respond with
        the most likely equivalent in ${ source_language }. Consider the sentence
        context for disambiguation.

        Respond with ONLY the word or short phrase. No explanations.
    ` ),

    user: `Sentence: "${ sentence_context }"\n\nWord: ${ word }`

} )

