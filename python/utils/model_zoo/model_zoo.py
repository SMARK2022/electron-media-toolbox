# -*- coding: utf-8 -*-
# Based on insightface.ai by Jia Guo, simplified for RetinaFace only

import onnxruntime
from .retinaface import RetinaFace

__all__ = ["get_retinaface_model"]

DEFAULT_PROVIDERS = ["CUDAExecutionProvider", "CPUExecutionProvider"]


class PickableInferenceSession(onnxruntime.InferenceSession):
    """Wrapper to make InferenceSession pickable."""

    def __init__(self, model_path, **kwargs):
        super().__init__(model_path, **kwargs)
        self.model_path = model_path

    def __getstate__(self):
        return {"model_path": self.model_path}

    def __setstate__(self, values):
        self.__init__(values["model_path"])


def get_retinaface_model(model_file, providers=None, provider_options=None):
    """Factory function to create RetinaFace model from ONNX file."""
    providers = providers or DEFAULT_PROVIDERS
    session = PickableInferenceSession(model_file, providers=providers, provider_options=provider_options)
    print(f"Applied providers: {session._providers}, with options: {session._provider_options}")
    return RetinaFace(model_file=model_file, session=session)
