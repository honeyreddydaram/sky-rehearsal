import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import '../style.css';

createRoot(document.getElementById('root')!).render(<App />);
