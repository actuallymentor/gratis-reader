import { Routes as RouterRoutes, Route, Navigate } from 'react-router-dom'

import OnboardingPage from '../components/pages/OnboardingPage.jsx'
import LibraryPage from '../components/pages/LibraryPage.jsx'
import ReaderPage from '../components/pages/ReaderPage.jsx'
import { use_settings_store } from '../stores/settings_store.js'

export default function Routes() {

    const api_key = use_settings_store( state => state.api_key )

    return <RouterRoutes>

        { /* Redirect to library if already onboarded */ }
        <Route path="/" element={ api_key ? <Navigate to="/library" replace /> : <OnboardingPage /> } />
        <Route path="/library" element={ api_key ? <LibraryPage /> : <Navigate to="/" replace /> } />
        <Route path="/read/:book_id" element={ api_key ? <ReaderPage /> : <Navigate to="/" replace /> } />

        { /* Catch-all — redirect unknown routes */ }
        <Route path="*" element={ <Navigate to="/" replace /> } />

    </RouterRoutes>

}
