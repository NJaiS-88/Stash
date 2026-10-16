import { createContext, useState, useEffect } from 'react';
import { getUser } from './services/auth.api';

const AuthContext = createContext();

export const AuthProvider = ({children}) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState(null);

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
