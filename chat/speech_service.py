"""Сервис транскрипции голосовых сообщений через Google Web Speech API."""

import io
import logging
import os

logger = logging.getLogger(__name__)

_FFMPEG_BIN = None
_HAS_PYDUB = False

try:
    import imageio_ffmpeg

    _FFMPEG_BIN = imageio_ffmpeg.get_ffmpeg_exe()
    os.environ["PYDUB_FFMPEG_BINARY"] = _FFMPEG_BIN
    from pydub import AudioSegment
    _HAS_PYDUB = True
except Exception:
    pass

try:
    import speech_recognition as sr
    _HAS_SR = True
except Exception:
    _HAS_SR = False


def transcribe_audio(file_obj) -> str:
    """Транскрибирует аудио-файл в текст."""
    if not _HAS_SR:
        logger.warning("SpeechRecognition не установлен")
        return ""

    data = file_obj.read()
    file_obj.seek(0)

    recognizer = sr.Recognizer()
    audio_data = None

    if _HAS_PYDUB:
        try:
            raw = io.BytesIO(data)
            segment = AudioSegment.from_file(raw)
            wav_buf = io.BytesIO()
            segment.export(wav_buf, format="wav")
            wav_buf.seek(0)
            audio_data = sr.AudioFile(wav_buf)
        except Exception as exc:
            logger.warning("Ошибка конвертации аудио: %s", exc)

    if audio_data is None:
        try:
            audio_data = sr.AudioFile(io.BytesIO(data))
        except Exception as exc:
            logger.warning("Не удалось открыть аудио: %s", exc)
            return ""

    try:
        with audio_data as source:
            recognizer.adjust_for_ambient_noise(source)
            audio = recognizer.record(source)
        text = recognizer.recognize_google(audio, language="ru-RU")
        return text
    except sr.UnknownValueError:
        return ""
    except sr.RequestError as exc:
        logger.warning("Ошибка Google Speech API: %s", exc)
        return ""
    except Exception as exc:
        logger.warning("Ошибка транскрипции: %s", exc)
        return ""
