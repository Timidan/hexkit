#!/bin/bash

# Server management script for Web3 Toolkit
echo "Web3 Toolkit Server Management"
echo "================================"

# Function to check if server is running
check_server() {
    if ps aux | grep -v grep | grep -q "vite"; then
        echo "Server is running"
        echo "   PID: $(ps aux | grep -v grep | grep vite | awk '{print $2}')"
        echo "   Port: 5173"
        echo "   URL: http://localhost:5173/"
        return 0
    else
        echo "Server is not running"
        return 1
    fi
}

# Function to stop server
stop_server() {
    echo "Stopping server..."
    pkill -f "vite" 2>/dev/null || pkill -f "node.*dev" 2>/dev/null
    sleep 2
    if ps aux | grep -v grep | grep -q "vite"; then
        echo "Force killing server..."
        pkill -9 -f "vite" 2>/dev/null
    fi
    echo "Server stopped"
}

# Function to start server
start_server() {
    echo "Starting server..."
    # Check if already running
    if ps aux | grep -v grep | grep -q "vite"; then
        echo "Server is already running!"
        return 1
    fi
    
    # Start server in background
    npm run dev > server.log 2>&1 &
    
    # Wait for server to start
    sleep 3
    
    # Check if started successfully
    if ps aux | grep -v grep | grep -q "vite"; then
        echo "Server started successfully"
        echo "   PID: $(ps aux | grep -v grep | grep vite | awk '{print $2}')"
        echo "   URL: http://localhost:5173/"
        echo "   Logs: tail -f server.log"
    else
        echo "Failed to start server"
        echo "   Check logs: cat server.log"
        return 1
    fi
}

# Function to restart server
restart_server() {
    echo "Restarting server..."
    stop_server
    sleep 1
    start_server
}

# Function to show server logs
show_logs() {
    echo "Server Logs:"
    echo "=================="
    if [ -f server.log ]; then
        tail -20 server.log
    else
        echo "No log file found"
    fi
}

# Main logic
case "${1:-status}" in
    "status")
        check_server
        ;;
    "start")
        start_server
        ;;
    "stop")
        stop_server
        ;;
    "restart")
        restart_server
        ;;
    "logs")
        show_logs
        ;;
    *)
        echo "Usage: $0 {status|start|stop|restart|logs}"
        echo ""
        echo "  status  - Check if server is running"
        echo "  start   - Start the server"
        echo "  stop    - Stop the server"
        echo "  restart - Restart the server"
        echo "  logs    - Show server logs"
        exit 1
        ;;
esac
