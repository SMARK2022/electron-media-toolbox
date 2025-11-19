from PIL import Image

def read_image(img_name, transform):
    image = Image.open(img_name).convert('RGB')
    return transform(image)
