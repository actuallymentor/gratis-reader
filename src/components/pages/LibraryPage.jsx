import { useEffect, useState } from 'react'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { useShallow } from 'zustand/react/shallow'
import { use_library_store } from '../../stores/library_store.js'
import BookCard from '../molecules/BookCard.jsx'
import FileUploader from '../molecules/FileUploader.jsx'
import GutenbergSection from '../molecules/GutenbergSection.jsx'
import SettingsDrawer from '../molecules/SettingsDrawer.jsx'
import Skeleton from '../atoms/Skeleton.jsx'
import { Button, IconButton } from '../atoms/Button.jsx'
import { use_confirm } from '../molecules/ConfirmModal.jsx'
import { Library, Menu, WifiOff } from 'lucide-react'

const Page = styled.div`
    min-height: 100dvh;
    background: var(--bg);
`

const Header = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-s) var(--space-m);
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface);

    @media (min-width: 768px) { padding: var(--space-m) var(--space-xl); }
`

const AppTitle = styled.h1`
    font-size: 1.3em;
    color: var(--accent);
`

const Content = styled.main`
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-m);

    @media (min-width: 768px) { padding: var(--space-xl); }
`

const BookGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-s);
    margin-top: var(--space-l);

    @media (min-width: 600px) { gap: var(--space-l); }

    @media (min-width: 768px) {
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
`

// Loading placeholders shaped like the cards they stand in for: a row on phones, a cover card wider
const SkeletonCard = styled( Skeleton )`
    height: 7.75rem;
    border-radius: var(--radius-m);

    @media (min-width: 600px) { height: 23.75rem; }
`

const reduced_motion = () => window.matchMedia?.( `(prefers-reduced-motion: reduce)` ).matches

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--space-xl) var(--space-m);
    color: var(--text-muted);

    > svg {
        width: 1.75rem;
        height: 1.75rem;
        margin-bottom: var(--space-s);
        color: var(--accent);
    }
`

const EmptyTitle = styled.h2`
    color: var(--text);
    font-size: 1.25rem;
    margin-bottom: var(--space-s);
`

const EmptyText = styled.p`
    max-width: 30rem;
    margin-bottom: var(--space-m);
    line-height: 1.6;
`

const OfflineBanner = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    background: var(--warning-tint);
    color: var(--warning-text);
    padding: var(--space-xs) var(--space-m);
    font-size: 0.85rem;

    svg { width: 1rem; height: 1rem; }
`

const UploadSection = styled.div`
    margin-bottom: var(--space-xl);
`

export default function LibraryPage() {

    const [ confirm_element, confirm ] = use_confirm()
    const { books, loading, load_books, remove_book } = use_library_store( useShallow(
        ( { books, loading, load_books, remove_book } ) => ( { books, loading, load_books, remove_book } )
    ) )
    const [ settings_open, set_settings_open ] = useState( false )
    const [ is_offline, set_is_offline ] = useState( !navigator.onLine )

    // Load books on mount
    useEffect( () => {
        load_books()
    }, [ load_books ] )

    // Online/offline detection
    useEffect( () => {
        const go_online = () => set_is_offline( false )
        const go_offline = () => set_is_offline( true )
        window.addEventListener( `online`, go_online )
        window.addEventListener( `offline`, go_offline )
        return () => {
            window.removeEventListener( `online`, go_online )
            window.removeEventListener( `offline`, go_offline )
        }
    }, [] )

    const handle_delete = async ( book ) => {
        const confirmed = await confirm( {
            title: `Remove “${ book.title }”?`,
            body: <>
                <p>The book file and your reading progress are deleted from this device.</p>
                <p>Its translations stay cached, so adding the same book again costs nothing extra.</p>
            </>,
            acknowledgement: `I understand the book file is permanently deleted from this device`,
            confirm_label: `Remove book`
        } )
        if( !confirmed ) return
        await remove_book( book.id )
        toast.success( `Removed "${ book.title }"` )
    }

    return <Page>

        { is_offline && <OfflineBanner role="status">
            <WifiOff strokeWidth={ 1.5 } aria-hidden="true" />
            Offline · showing your saved library
        </OfflineBanner> }

        <Header>
            <AppTitle>Gratis Reader</AppTitle>
            <IconButton label="Settings" icon={ <Menu strokeWidth={ 1.5 } /> } onClick={ () => set_settings_open( true ) } />
        </Header>

        <Content>

            <UploadSection>
                <FileUploader />
            </UploadSection>

            { loading && <BookGrid aria-busy="true" aria-label="Loading your library">
                { Array.from( { length: 4 } ).map( ( _, i ) =>
                    <SkeletonCard key={ i } />
                ) }
            </BookGrid> }

            { !loading && books.length === 0 && <EmptyState>
                <Library strokeWidth={ 1.5 } aria-hidden="true" />
                <EmptyTitle>Your library is empty</EmptyTitle>
                <EmptyText>
                    Upload an EPUB file to start reading in a new language, or pick a free classic below.
                </EmptyText>
                <Button onClick={ () => document.getElementById( `classic-library` )?.scrollIntoView( { behavior: reduced_motion() ? `auto` : `smooth`, block: `start` } ) }>
                    Browse classics
                </Button>
            </EmptyState> }

            { !loading && books.length > 0 && <BookGrid>
                { books.map( book =>
                    <BookCard
                        key={ book.id }
                        book={ book }
                        on_delete={ () => handle_delete( book ) }
                    />
                ) }
            </BookGrid> }

            <GutenbergSection />

        </Content>

        { confirm_element }

        <SettingsDrawer
            is_open={ settings_open }
            on_close={ () => set_settings_open( false ) }
            show_language={ false }
        />

    </Page>

}
