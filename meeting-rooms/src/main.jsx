import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import MeetingPopoutPage from './MeetingPopoutPage.jsx';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const roomBookingId = params.get('room');

createRoot(document.getElementById('root')).render(
  roomBookingId ? <MeetingPopoutPage bookingId={roomBookingId} /> : <App />
);
