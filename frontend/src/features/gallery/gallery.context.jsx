import { createContext, useState } from 'react';

const GalleryContext = createContext();

export const GalleryProvider = ({ children }) => {
    const [folders, setFolders] = useState([]);
    const [activeFolder, setActiveFolder] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    return (
        <GalleryContext.Provider value={{
            folders,
            setFolders,
            activeFolder,
            setActiveFolder,
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
