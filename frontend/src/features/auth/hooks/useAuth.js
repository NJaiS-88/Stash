import { useContext } from 'react';
import AuthContext from '../auth.context';
import { loginUser, registerUser, logoutUser, getUser } from '../services/auth.api';
import { visionQueue } from '../../gallery/services/visionQueue';
import { revokeAllBlobUrls } from '../../gallery/services/blobRegistry';
import { setLocalOwnerId } from '../../gallery/services/galleryDb';

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    const { user, setUser, loading, setLoading, errorMessage, setErrorMessage } = context;

    const handleLogin = async (email, password) => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const response = await loginUser({ email, password });
            setUser(response.user);
            return response;
        } catch (error) {
            setErrorMessage(error.message);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        setLoading(true);
        setErrorMessage(null);
        try {
            // Immediate in-memory state purge: cancel AI queue, revoke all Blob URLs, unset local owner
            visionQueue.stop();
            revokeAllBlobUrls();
            setLocalOwnerId(null);

            await logoutUser();
            setUser(null);
        } catch (error) {
            setErrorMessage(error.message);
            throw error;    
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (username, email, password) => {
        setLoading(true);
        setErrorMessage(null);
        try {
            const response = await registerUser({ username, email, password });
            setUser(response.user);
            return response;
        } catch (error) {
            setErrorMessage(error.message);
            throw error;
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyUser = async () => {
        setLoading(true);
        try {
            const response = await getUser();
            setUser(response.user);
        } catch (error) {
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    return { 
        user, 
        setUser, 
        loading, 
        setLoading, 
        errorMessage, 
        setErrorMessage, 
        handleLogin, 
        handleLogout, 
        handleRegister, 
        handleVerifyUser 
    };
};