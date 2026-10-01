import { useMemo } from 'react'
import ComboBox from './ComboBox.jsx'
import { COMMON_LANGUAGES } from '../../modules/prompts.js'

/**
 * Target language picker: common languages, searchable, and any typed language accepted
 * @param {Object} props
 * @param {string} props.value - Currently selected language
 * @param {Function} props.on_change
 * @param {string} [props.id] - For a visible <label htmlFor>
 */
export default function LanguagePicker( { value, on_change, id } ) {

    // A previously typed custom language stays selectable
    const options = useMemo( () => {
        const languages = COMMON_LANGUAGES.includes( value ) || !value ? COMMON_LANGUAGES : [ value, ...COMMON_LANGUAGES ]
        return languages.map( language => ( { value: language, label: language } ) )
    }, [ value ] )

    return <ComboBox
        id={ id }
        label={ id ? undefined : `Target language` }
        value={ value }
        options={ options }
        on_change={ on_change }
        placeholder="Search languages..."
        allow_custom
    />

}
