import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styled from 'styled-components'
import toast from 'react-hot-toast'
import { use_library_store } from '../../stores/library_store.js'
import BookCard from '../molecules/BookCard.jsx'
import FileUploader from '../molecules/FileUploader.jsx'
import GutenbergSection from '../molecules/GutenbergSection.jsx'
import SettingsDrawer from '../molecules/SettingsDrawer.jsx'
import Skeleton from '../atoms/Skeleton.jsx'

const Page = styled.div`
    min-height: 100dvh;
    background: var(--bg);
`

const Header = styled.header`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-l) var(--space-xl);
    border-bottom: 1px solid var(--border);
`

const AppTitle = styled.h1`
    font-size: 1.3em;
    color: var(--accent);
`

const GearButton = styled.button`
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.4em;
    min-width: 44px;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-s);

    &:hover { background: var(--bg-hover); color: var(--text); }
`

const Content = styled.main`
    max-width: 1200px;
    margin: 0 auto;
    padding: var(--space-xl);
`

const BookGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--space-l);
    margin-top: var(--space-xl);

    @media (min-width: 768px) {
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    }
`

const EmptyState = styled.div`
    text-align: center;
    padding: var(--space-3xl) var(--space-xl);
    color: var(--text-muted);
`

const EmptyTitle = styled.h2`
    color: var(--text);
    margin-bottom: var(--space-s);
`

const EmptyText = styled.p`
    margin-bottom: var(--space-2xl);
    line-height: 1.6;
`

const OfflineBanner = styled.div`
    background: var(--accent-light);
    color: var(--accent-dark);
    text-align: center;
    padding: var(--space-xs) var(--space-m);
    font-size: 0.8em;
`

const UploadSection = styled.div`
    margin-bottom: var(--space-xl);
`

export default function LibraryPage() {

    const navigate = useNavigate()
    const { books, loading, load_books, remove_book } = use_library_store()
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
        if( window.confirm( `Remove "${ book.title }" from your library?` ) ) {
            await remove_book( book.id )
            toast.success( `Removed "${ book.title }"` )
        }
    }

    return <Page>

        { is_offline && <OfflineBanner>
            Offline — showing cached library
        </OfflineBanner> }

        <Header>
            <AppTitle>Gratis Reader</AppTitle>
            <GearButton onClick={ () => set_settings_open( true ) } aria-label="Settings">
                ⚙
            </GearButton>
        </Header>

        <Content>

            <UploadSection>
                <FileUploader />
            </UploadSection>

            { loading && <BookGrid>
                { Array.from( { length: 4 } ).map( ( _, i ) =>
                    <Skeleton key={ i } height="280px" />
                ) }
            </BookGrid> }

            { !loading && books.length === 0 && <EmptyState>
                <EmptyTitle>Your library is empty</EmptyTitle>
                <EmptyText>
                    Upload an EPUB file to start reading in a new language.
                </EmptyText>
            </EmptyState> }

            { !loading && books.length > 0 && <BookGrid>
                { books.map( book =>
                    <BookCard
                        key={ book.id }
                        book={ book }
                        on_open={ () => navigate( `/read/${ book.id }` ) }
                        on_delete={ () => handle_delete( book ) }
                    />
                ) }
            </BookGrid> }

            <GutenbergSection />

        </Content>

        <SettingsDrawer
            is_open={ settings_open }
            on_close={ () => set_settings_open( false ) }
            show_language={ false }
        />

    </Page>

}
