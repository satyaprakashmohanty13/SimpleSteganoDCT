import streamlit as st
import cv2
import numpy as np
from simpleSteganoDCT import SimpleStegano
import os

st.title("SimpleSteganoDCT")

steg = SimpleStegano()

tab1, tab2 = st.tabs(["Embed Text", "Extract Text"])

with tab1:
    st.header("Embed Text into an Image")

    uploaded_file = st.file_uploader("Choose a cover image...", type=["jpg", "jpeg", "png"])
    secret_text = st.text_area("Enter the text to hide:")

    if st.button("Embed Text"):
        if uploaded_file is not None and secret_text:
            # Save uploaded file to a temporary location
            with open("temp_cover.png", "wb") as f:
                f.write(uploaded_file.getbuffer())

            output_path = "stego_image.png"

            try:
                steg.embed_text_steganography("temp_cover.png", secret_text, output_path)
                st.success(f"Text embedded successfully! Download the image below.")

                with open(output_path, "rb") as file:
                    st.download_button(
                        label="Download Stego Image",
                        data=file,
                        file_name="stego_image.png",
                        mime="image/png"
                    )

                st.image(output_path, caption="Stego Image")

            except Exception as e:
                st.error(f"An error occurred: {e}")
            finally:
                if os.path.exists("temp_cover.png"):
                    os.remove("temp_cover.png")

with tab2:
    st.header("Extract Text from an Image")

    stego_file = st.file_uploader("Choose a stego image...", type=["png"])

    if st.button("Extract Text"):
        if stego_file is not None:
            # Save uploaded file to a temporary location
            with open("temp_stego.png", "wb") as f:
                f.write(stego_file.getbuffer())

            try:
                extracted_text = steg.extract_text_steganography("temp_stego.png")
                st.success("Extraction successful!")
                st.text_area("Extracted Text", extracted_text, height=200)

            except Exception as e:
                st.error(f"An error occurred during extraction: {e}")
            finally:
                if os.path.exists("temp_stego.png"):
                    os.remove("temp_stego.png")
