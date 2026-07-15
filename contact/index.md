---
title: Contact
nav:
  order: 5
  tooltip: Email, address, and location
---

# {% include icon.html icon="fa-regular fa-envelope" %}Contact

<<<<<<< HEAD
Our lab is located at the [Department of Biology and Biotechnology](https://dbb.dip.unipv.it/en) of the [University of Pavia](https://portale.unipv.it/it).
{:.center}
=======
Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
>>>>>>> template/main

{%
  include button.html
  type="email"
<<<<<<< HEAD
  text="lino.ometto@unipv.it"
  link="lino.ometto@unipv.it"
=======
  text="jane@smith.com"
  link="jane@smith.com"
>>>>>>> template/main
%}
{%
  include button.html
  type="phone"
<<<<<<< HEAD
  text="+39 0382 986079"
  link="+39 0382 986079"
=======
  text="(555) 867-5309"
  link="+1-555-867-5309"
>>>>>>> template/main
%}
{%
  include button.html
  type="address"
<<<<<<< HEAD
  text="Find us on the map"
  tooltip="Department of Biology and Biotechnology - University of Pavia - Via Ferrata 9 - 27100 Pavia - Italy"
  link="https://maps.app.goo.gl/fLJnAQTo72NxbecJ8"
%}

{:.center}

## Mailing Address

{% capture text %}
Dipartimento di Biologia e Biotecnologie "L. Spallanzani"  
Università di Pavia  
Via Ferrata 9  
27100 Pavia  
Italy
{% endcapture %}

{%
  include feature.html
  image="images/unipv.png"
  flip=true
  text=text
%}

{%
  include figure.html
  image="images/nuvola.png"
  width="100%"
=======
  tooltip="Our location on Google Maps for easy navigation"
  link="https://www.google.com/maps"
>>>>>>> template/main
%}

{% include section.html %}

<<<<<<< HEAD

=======
{% capture col1 %}

{%
  include figure.html
  image="images/photo.jpg"
  caption="Lorem ipsum"
%}

{% endcapture %}

{% capture col2 %}

{%
  include figure.html
  image="images/photo.jpg"
  caption="Lorem ipsum"
%}

{% endcapture %}

{% include cols.html col1=col1 col2=col2 %}

{% include section.html dark=true %}

{% capture col1 %}
Lorem ipsum dolor sit amet  
consectetur adipiscing elit  
sed do eiusmod tempor
{% endcapture %}

{% capture col2 %}
Lorem ipsum dolor sit amet  
consectetur adipiscing elit  
sed do eiusmod tempor
{% endcapture %}

{% capture col3 %}
Lorem ipsum dolor sit amet  
consectetur adipiscing elit  
sed do eiusmod tempor
{% endcapture %}

{% include cols.html col1=col1 col2=col2 col3=col3 %}
>>>>>>> template/main
