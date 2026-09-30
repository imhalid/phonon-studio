FROM python:3.12-alpine

WORKDIR /app

COPY index.html style.css app.js server.py ./

EXPOSE 3000

ENV PORT=3000 \
    PHONON_BACKEND_URL=http://localhost:8000 \
    PHONON_API_KEY=phonon-local

CMD ["python3", "server.py"]
