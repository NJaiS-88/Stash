import { createContext, useState } from 'react';

const GalleryContext = createContext();

export const GalleryProvider = ({ children }) => {
    const [directoryHandle, setDirectoryHandle] = useState(null);
    const [folderName, setFolderName] = useState('');
    const [entries, setEntries] = useState([]);
    const [flatFiles, setFlatFiles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    return (
        <GalleryContext.Provider value={{
            directoryHandle,
            setDirectoryHandle,
            folderName,
            setFolderName,
            entries,
            setEntries,
            flatFiles,
            setFlatFiles,
            loading,
            setLoading,
            error,
            setError
        }}>
            {children}
        </GalleryContext.Provider>
    );
};

export default GalleryContext;
