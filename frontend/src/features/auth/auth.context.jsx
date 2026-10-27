import { createContext, useState, useEffect } from 'react';
import { getUser } from './services/auth.api';
import { setLocalOwnerId } from '../gallery/services/galleryDb';
import { visionQueue } from '../gallery/services/visionQueue';
import { revokeAllBlobUrls } from '../gallery/services/blobRegistry';

const AuthContext = createContext();

export const AuthProvider = ({children}) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);

    useEffect(() => {
        if (user) {
            const ownerId = String(user.id || user._id);
            setLocalOwnerId(ownerId);
            visionQueue.setOwner(ownerId);
            if (user.fingerprintSecret) {
                localStorage.setItem('stash_user_fingerprint_secret', user.fingerprintSecret);
            }
        } else {
            // User logged out: immediately clear all in-memory user-specific state
            setLocalOwnerId(null);
            visionQueue.stop();
            revokeAllBlobUrls();
            localStorage.removeItem('stash_user_fingerprint_secret');
        }
    }, [user]);

    useEffect(() => {
        const verify = async () => {
            try {
                const response = await getUser();
                setUser(response.user);
            } catch {
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        verify();
    }, []);

    return (
        <AuthContext.Provider value={{user, setUser, loading, setLoading, errorMessage, setErrorMessage}}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
